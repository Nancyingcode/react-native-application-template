package com.whitelabelapp.ota

import android.content.Context
import android.util.AtomicFile
import android.util.Base64
import com.whitelabelapp.BuildConfig
import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID
import java.time.Instant
import java.io.File
import java.net.URL
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import javax.net.ssl.HttpsURLConnection

class OtaStore(private val context: Context) {
  private val baseline: JSONObject? = if (BuildConfig.DEBUG) null else try {
    JSONObject(context.assets.open("ota/bundle-manifest.json").bufferedReader().use { it.readText() })
  } catch (_: Exception) { null }
  private val root = File(context.noBackupFilesDir, "ota/${baseline?.getString("runtimeVersion") ?: "disabled"}")
  private val stateFile = AtomicFile(File(root, "state.json"))
  private var state = JSONObject()
  private var selected = false
  private var selectedPath: String? = null
  private var runningVersion = 0
  private val publicKey = try { context.assets.open("ota/public-key.pem").bufferedReader().use { it.readText() } } catch (_: Exception) { "" }

  init {
    root.mkdirs()
    state = try { JSONObject(stateFile.openRead().bufferedReader().use { it.readText() }) } catch (_: Exception) { JSONObject() }
  }

  private fun receipt(nextState: JSONObject, kind: String, sequence: Int, running: Int, error: String? = null) {
    val tracking = nextState.optJSONObject("tracking") ?: return
    val kinds = nextState.optJSONArray("receiptKinds") ?: JSONArray()
    for (i in 0 until kinds.length()) if (kinds.getString(i) == kind) return
    val events = nextState.optJSONArray("receipts") ?: JSONArray()
    for (i in 0 until events.length()) {
      val item = events.getJSONObject(i)
      if (item.getJSONObject("context").optString("attemptId") == tracking.optString("attemptId") && item.getJSONObject("event").optString("kind") == kind) return
    }
    val event = JSONObject().put("eventId", UUID.randomUUID().toString()).put("protocolVersion", 1)
      .put("sequence", sequence).put("kind", kind).put("occurredAt", Instant.now().toString())
      .put("runningVersion", if (kind == "startup_unconfirmed") JSONObject.NULL else running).put("highestVersion", nextState.optInt("highest", 0))
    if (error != null) event.put("errorCode", error)
    events.put(JSONObject().put("context", tracking).put("event", event))
    while (events.length() > 64) {
      events.remove(0)
      nextState.put("droppedReceipts", nextState.optInt("droppedReceipts", 0) + 1)
    }
    nextState.put("receipts", events)
    kinds.put(kind)
    nextState.put("receiptKinds", kinds)
  }

  private fun save(nextState: JSONObject) {
    if (nextState.optInt("pending", 0) > version("pending")) receipt(nextState, "staged", 20, runningVersion)
    val trialEnded = version("trial") != 0 && nextState.optInt("trial", 0) == 0
    if (trialEnded && nextState.optInt("failed", 0) == version("trial")) receipt(nextState, "startup_unconfirmed", 40, nextState.optInt("current", 0), "STARTUP_UNCONFIRMED")
    else if (trialEnded && runningVersion == version("trial")) receipt(nextState, "confirmed", 50, runningVersion)
    val stream = stateFile.startWrite()
    try { stream.write(nextState.toString().toByteArray()); stateFile.finishWrite(stream) }
    catch (error: Exception) { stateFile.failWrite(stream); throw error }
    // Failed persistence must leave pending/trial available for retry and recovery.
    state = nextState
  }

  private fun version(name: String) = state.optInt(name, 0)
  private fun directory(version: Int) = File(root, version.toString())
  private fun hash(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

  private fun verifyEnvelope(bytes: ByteArray): JSONObject {
    check(baseline != null && publicKey.isNotEmpty()) { "OTA disabled: no embedded public key" }
    check(bytes.size <= 65536) { "Manifest too large" }
    val envelope = JSONObject(bytes.toString(Charsets.UTF_8))
    val payload = Base64.decode(envelope.getString("payload"), Base64.NO_WRAP)
    val signature = Base64.decode(envelope.getString("signature"), Base64.NO_WRAP)
    val keyBytes = Base64.decode(publicKey.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replace(Regex("\\s"), ""), Base64.NO_WRAP)
    val verifier = Signature.getInstance("SHA256withRSA")
    verifier.initVerify(KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(keyBytes)))
    verifier.update(payload)
    check(verifier.verify(signature)) { "Invalid OTA signature" }
    val manifest = JSONObject(payload.toString(Charsets.UTF_8))
    for (key in listOf("schemaVersion", "platform", "brandId", "environment", "channel", "appVersion", "buildNumber", "baseVersion", "nativeFingerprint", "assetsFingerprint", "runtimeVersion")) {
      check(manifest.get(key) == baseline.get(key)) { "Incompatible OTA: $key" }
    }
    val updateVersion = manifest.getLong("bundleVersion")
    check(updateVersion in 1..2100000000L && manifest.getDouble("bundleVersion") == updateVersion.toDouble()) { "Invalid OTA version" }
    check(manifest.getLong("businessBytes") in 1..20L * 1024 * 1024) { "Invalid OTA size" }
    check(Regex("[a-f0-9]{64}").matches(manifest.getString("businessSha256"))) { "Invalid OTA hash" }
    return manifest
  }

  private fun verifyBusiness(manifest: JSONObject, bytes: ByteArray) {
    check(bytes.size.toLong() == manifest.getLong("businessBytes") && hash(bytes) == manifest.getString("businessSha256")) { "Business bundle integrity check failed" }
  }

  private fun readHttps(address: String, limit: Int): ByteArray {
    val deadline = System.nanoTime() + 60_000_000_000L
    val url = URL(address)
    check(url.protocol == "https" && url.userInfo == null && url.ref == null) { "OTA requires HTTPS" }
    val connection = url.openConnection() as HttpsURLConnection
    connection.connectTimeout = 15000
    connection.readTimeout = 30000
    // Reject redirects so an HTTPS origin cannot silently downgrade transport.
    connection.instanceFollowRedirects = false
    try {
      check(connection.responseCode == 200) { "OTA HTTP ${connection.responseCode}" }
      check(connection.contentLengthLong <= limit) { "OTA download too large" }
      return connection.inputStream.use { input ->
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
          check(System.nanoTime() < deadline) { "OTA download timed out" }
          val count = input.read(buffer)
          if (count < 0) break
          check(output.size() + count <= limit) { "OTA download too large" }
          output.write(buffer, 0, count)
        }
        output.toByteArray()
      }
    } finally { connection.disconnect() }
  }

  private var stageContext: JSONObject? = null
  private fun recordAttempt(kind: String, sequence: Int, error: String? = null) {
    if (stageContext == null) return
    // A telemetry write failure must not reject a valid download or replace its error.
    try {
      val next = JSONObject(state.toString())
      val previousTracking = next.optJSONObject("tracking")
      val previousKinds = next.optJSONArray("receiptKinds")
      next.put("tracking", stageContext).put("receiptKinds", JSONArray())
      receipt(next, kind, sequence, runningVersion, error)
      next.put("tracking", previousTracking).put("receiptKinds", previousKinds)
      save(next)
    } catch (_: Exception) { }
  }
  @Synchronized fun stageTracked(url: String, context: String): Int {
    stageContext = JSONObject(context)
    try { return stage(url) }
    catch (error: Exception) { recordAttempt("download_failed", 30, "DOWNLOAD_OR_STAGE_FAILED"); throw error }
    finally { stageContext = null }
  }

  @Synchronized fun stage(url: String): Int {
    check(baseline != null && publicKey.isNotEmpty()) { "OTA not enabled for this package" }
    check(version("trial") == 0 && version("pending") == 0) { "An OTA update is awaiting confirmation or restart" }
    recordAttempt("download_started", 10)
    val envelope = readHttps(url, 65536)
    val manifest = verifyEnvelope(envelope)
    val next = manifest.getInt("bundleVersion")
    check(next > version("highest")) { "OTA version is not newer than the highest installed version" }
    val business = readHttps(manifest.getString("businessUrl"), manifest.getInt("businessBytes"))
    verifyBusiness(manifest, business)
    val target = directory(next)
    target.mkdirs()
    AtomicFile(File(target, "business.bundle")).let { file ->
      val stream = file.startWrite()
      try { stream.write(business); file.finishWrite(stream) } catch (error: Exception) { file.failWrite(stream); throw error }
    }
    File(target, "release.json").writeBytes(envelope)
    save(JSONObject(state.toString()).put("pending", next).put("highest", next).put("tracking", stageContext).put("receiptKinds", JSONArray()))
    return next
  }

  private fun prepare(updateVersion: Int): String? {
    if (updateVersion == 0) return null
    val target = directory(updateVersion)
    val manifest = verifyEnvelope(File(target, "release.json").readBytes())
    check(manifest.getInt("bundleVersion") == updateVersion) { "Stored version mismatch" }
    val business = File(target, "business.bundle").readBytes()
    verifyBusiness(manifest, business)
    val base = context.assets.open("ota/base.bundle").use { it.readBytes() }
    check(hash(base) == baseline!!.getString("baseVersion")) { "Base bundle integrity check failed" }
    val combined = File(target, "combined.bundle")
    // Hermes accepts source scripts. Concatenation keeps one runtime and avoids
    // private bridge APIs; never concatenate Hermes bytecode files.
    combined.outputStream().use { it.write(base); it.write('\n'.code); it.write(business) }
    return combined.absolutePath
  }

  @Synchronized fun selectBundle(): String? {
    if (selected) return selectedPath
    selected = true
    if (baseline == null) return null
    try {
      // Persist the trial BEFORE execution: a crash or process kill before JS
      // confirms readiness must restore the previous confirmed version.
      val nextState = JSONObject(state.toString())
      if (version("trial") != 0) {
        nextState.put("failed", version("trial")).put("current", version("previous")).put("previous", 0).put("trial", 0).put("recoveryError", "STARTUP_UNCONFIRMED")
      }
      if (version("pending") != 0) {
        nextState.put("previous", nextState.optInt("current", 0)).put("current", version("pending")).put("trial", version("pending")).put("pending", 0)
      }
      save(nextState)
      runningVersion = version("current")
      try { selectedPath = prepare(runningVersion) }
      catch (_: Exception) {
        val fallback = JSONObject(state.toString()).put("failed", runningVersion).put("current", version("previous")).put("previous", 0).put("trial", 0).put("recoveryError", "LOCAL_BUNDLE_INVALID")
        val fallbackPath = try { prepare(fallback.optInt("current", 0)) } catch (_: Exception) { fallback.put("current", 0); null }
        save(fallback)
        runningVersion = version("current")
        selectedPath = fallbackPath
      }
      cleanup()
    } catch (_: Exception) { runningVersion = 0; selectedPath = null }
    val tracking = state.optJSONObject("tracking")
    val targetVersion = tracking?.optInt("targetVersion", 0) ?: 0
    val durableRecovery = targetVersion > 0 && version("highest") >= targetVersion && version("pending") == 0 && version("trial") == 0 && version("current") == runningVersion && runningVersion < targetVersion
    if (durableRecovery) {
      // Telemetry persistence must not change the already selected startup bundle.
      try {
        val nextState = JSONObject(state.toString())
        receipt(nextState, "restored", 60, runningVersion, state.optString("recoveryError", "STARTUP_UNCONFIRMED"))
        save(nextState)
      } catch (_: Exception) { }
    }
    return selectedPath
  }

  private fun cleanup() {
    val retained = setOf(version("current"), version("previous"), version("pending"))
    root.listFiles()?.filter { it.isDirectory && it.name.toIntOrNull() !in retained }?.forEach { it.deleteRecursively() }
  }

  @Synchronized fun markSuccessful(): Boolean {
    if (runningVersion != 0 && version("trial") == runningVersion) {
      save(JSONObject(state.toString()).put("trial", 0))
    }
    return true
  }

  @Synchronized fun status(): String = JSONObject().apply {
    put("telemetryVersion", 1)
    put("droppedReceipts", state.optInt("droppedReceipts", 0))
    put("receipts", state.optJSONArray("receipts") ?: JSONArray())
    put("supported", baseline != null && publicKey.isNotEmpty())
    put("runtimeVersion", baseline?.optString("runtimeVersion") ?: "")
    put("baseVersion", baseline?.optString("baseVersion") ?: "")
    put("currentVersion", runningVersion)
    put("pendingVersion", version("pending"))
    put("previousVersion", version("previous"))
    put("failedVersion", version("failed"))
    put("highestVersion", version("highest"))
  }.toString()

  private val telemetryFile get() = AtomicFile(File(context.noBackupFilesDir, "ota-telemetry.json"))
  @Synchronized fun readTelemetry(): String {
    return try { telemetryFile.openRead().bufferedReader().use { it.readText() } }
    catch (_: java.io.FileNotFoundException) {
      val initial = JSONObject().put("installationId", UUID.randomUUID().toString()).put("queue", JSONArray()).toString()
      writeTelemetry(initial)
      initial
    }
  }
  @Synchronized fun writeTelemetry(value: String): Boolean {
    check(value.toByteArray().size <= 131072) { "Telemetry capacity exceeded" }
    JSONObject(value)
    val file = telemetryFile
    val stream = file.startWrite()
    try { stream.write(value.toByteArray()); file.finishWrite(stream) }
    catch (error: Exception) { file.failWrite(stream); throw error }
    return true
  }
  @Synchronized fun ackTelemetry(value: String): Boolean {
    val ids = JSONArray(value)
    val accepted = (0 until ids.length()).map { ids.getString(it) }.toSet()
    val events = state.optJSONArray("receipts") ?: return true
    val retained = JSONArray()
    for (i in 0 until events.length()) if (events.getJSONObject(i).getJSONObject("event").getString("eventId") !in accepted) retained.put(events.get(i))
    save(JSONObject(state.toString()).put("receipts", retained))
    return true
  }

  companion object {
    @Volatile private var instance: OtaStore? = null
    fun get(context: Context): OtaStore = instance ?: synchronized(this) { instance ?: OtaStore(context.applicationContext).also { instance = it } }
  }
}
