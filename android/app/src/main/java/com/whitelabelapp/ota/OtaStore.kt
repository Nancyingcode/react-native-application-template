package com.whitelabelapp.ota

import android.content.Context
import android.util.AtomicFile
import android.util.Base64
import com.whitelabelapp.BuildConfig
import org.json.JSONObject
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

  private fun save(nextState: JSONObject) {
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

  @Synchronized fun stage(url: String): Int {
    check(baseline != null && publicKey.isNotEmpty()) { "OTA not enabled for this package" }
    check(version("trial") == 0 && version("pending") == 0) { "An OTA update is awaiting confirmation or restart" }
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
    save(JSONObject(state.toString()).put("pending", next).put("highest", next))
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
        nextState.put("failed", version("trial")).put("current", version("previous")).put("previous", 0).put("trial", 0)
      }
      if (version("pending") != 0) {
        nextState.put("previous", nextState.optInt("current", 0)).put("current", version("pending")).put("trial", version("pending")).put("pending", 0)
      }
      save(nextState)
      runningVersion = version("current")
      try { selectedPath = prepare(runningVersion) }
      catch (_: Exception) {
        val fallback = JSONObject(state.toString()).put("failed", runningVersion).put("current", version("previous")).put("previous", 0).put("trial", 0)
        val fallbackPath = try { prepare(fallback.optInt("current", 0)) } catch (_: Exception) { fallback.put("current", 0); null }
        save(fallback)
        runningVersion = version("current")
        selectedPath = fallbackPath
      }
      cleanup()
    } catch (_: Exception) { runningVersion = 0; selectedPath = null }
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
    put("supported", baseline != null && publicKey.isNotEmpty())
    put("runtimeVersion", baseline?.optString("runtimeVersion") ?: "")
    put("baseVersion", baseline?.optString("baseVersion") ?: "")
    put("currentVersion", runningVersion)
    put("pendingVersion", version("pending"))
    put("previousVersion", version("previous"))
    put("failedVersion", version("failed"))
    put("highestVersion", version("highest"))
  }.toString()

  companion object {
    @Volatile private var instance: OtaStore? = null
    fun get(context: Context): OtaStore = instance ?: synchronized(this) { instance ?: OtaStore(context.applicationContext).also { instance = it } }
  }
}
