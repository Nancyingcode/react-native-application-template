package com.whitelabelapp.monitoring

import android.os.Debug
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.AtomicFile
import android.util.Log
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.common.LifecycleState
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ScheduledFuture

class ThreadWatchdogModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val worker = Executors.newSingleThreadScheduledExecutor()
  private val main = Handler(Looper.getMainLooper())
  private val storage = AtomicFile(File(context.noBackupFilesDir, "thread-stalls.json"))
  // 所有检测状态仅在 worker 上读写；主线程和 JS 只投递确认，互不等待。
  private var enabled = false
  private var foreground = false
  private var generation = 0L
  private var jsBeat = 0L
  private var mainPending = 0L
  private var jsReported = false
  private var mainReported = false
  private var reports = mutableListOf<JSONObject>()
  private val thresholdMs = 5000L
  private var timer: ScheduledFuture<*>? = null

  init {
    context.addLifecycleEventListener(this)
    dispatch {
      try {
        if (storage.baseFile.exists()) {
          val saved = JSONArray(String(storage.readFully(), Charsets.UTF_8))
          for (index in 0 until saved.length()) reports.add(saved.getJSONObject(index))
          reports = reports.takeLast(40).toMutableList()
        }
      } catch (error: Exception) {
        Log.e("ThreadWatchdog", "Cannot read saved stalls", error)
      }
    }
  }

  override fun getName() = "ThreadWatchdog"

  @ReactMethod fun start() {
    dispatch {
      enabled = true
      foreground = context.lifecycleState == LifecycleState.RESUMED
      reset()
      if (timer == null) {
        timer = worker.scheduleWithFixedDelay({ tick() }, 1, 1, TimeUnit.SECONDS)
      }
    }
  }

  @ReactMethod fun stop() { dispatch { stopMonitoring() } }

  private fun stopMonitoring() {
    enabled = false
    timer?.cancel(false)
    timer = null
    reset()
  }

  @ReactMethod fun heartbeat() {
    val receivedAt = SystemClock.uptimeMillis()
    dispatch {
      if (enabled && foreground && receivedAt >= jsBeat) {
        checkJs(receivedAt)
        jsBeat = receivedAt
        jsReported = false
      }
    }
  }

  @ReactMethod fun getReports(promise: Promise) {
    dispatch { promise.resolve(JSONArray(reports).toString()) }
  }

  @ReactMethod fun acknowledgeReports(ids: String) {
    dispatch {
      try {
        val acknowledged = JSONArray(ids)
        val values = (0 until acknowledged.length()).map { acknowledged.getString(it) }.toSet()
        reports.removeAll { it.getString("id") in values }
        persist()
      } catch (error: Exception) {
        Log.e("ThreadWatchdog", "Cannot acknowledge stalls", error)
      }
    }
  }

  override fun onHostResume() { dispatch { foreground = true; reset() } }
  override fun onHostPause() { dispatch { foreground = false; reset() } }
  override fun onHostDestroy() { dispatch { foreground = false; reset() } }

  private fun dispatch(operation: () -> Unit) {
    try {
      worker.execute(operation)
    } catch (_: RejectedExecutionException) {
      // React teardown can race with lifecycle and probe callbacks; discard work after shutdown.
    }
  }

  private fun reset() {
    generation++
    main.removeCallbacksAndMessages(this)
    mainPending = 0
    jsBeat = SystemClock.uptimeMillis()
    jsReported = false
    mainReported = false
  }

  private fun tick() {
    if (!enabled || !foreground) return
    if (Debug.isDebuggerConnected()) { reset(); return }
    val now = SystemClock.uptimeMillis()
    checkJs(now)
    if (mainPending != 0L) {
      checkMain(now)
      return
    }
    mainPending = now
    val expectedGeneration = generation
    // 最多一个未完成探针，避免主线程卡死时队列无限增长。
    main.postAtTime({
      val acknowledgedAt = SystemClock.uptimeMillis()
      dispatch {
        if (generation == expectedGeneration) {
          checkMain(acknowledgedAt)
          mainPending = 0
          mainReported = false
        }
      }
    }, this, now)
  }

  private fun checkJs(now: Long) {
    if (!jsReported && now - jsBeat >= thresholdMs) {
      jsReported = true
      record("js", now - jsBeat)
    }
  }

  private fun checkMain(now: Long) {
    if (!mainReported && mainPending != 0L && now - mainPending >= thresholdMs) {
      mainReported = true
      record("native_main", now - mainPending)
    }
  }

  private fun record(thread: String, duration: Long) {
    val report = JSONObject().put("id", UUID.randomUUID().toString())
      .put("thread", thread).put("detectedAt", System.currentTimeMillis())
      .put("durationMs", duration).put("thresholdMs", thresholdMs)
    if (thread == "native_main") {
      report.put("stack", Looper.getMainLooper().thread.stackTrace.joinToString("\n"))
    }
    reports.add(report)
    if (reports.size > 40) reports.removeAt(0)
    Log.e("ThreadWatchdog", report.toString())
    persist()
  }

  private fun persist() {
    var output: java.io.FileOutputStream? = null
    try {
      output = storage.startWrite()
      output.write(JSONArray(reports).toString().toByteArray(Charsets.UTF_8))
      storage.finishWrite(output)
    } catch (error: Exception) {
      storage.failWrite(output)
      Log.e("ThreadWatchdog", "Cannot save stalls", error)
    }
  }

  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    main.removeCallbacksAndMessages(this)
    dispatch { stopMonitoring() }
    worker.shutdown()
    super.invalidate()
  }
}

class ThreadWatchdogPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == "ThreadWatchdog") ThreadWatchdogModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf("ThreadWatchdog" to ReactModuleInfo(
      "ThreadWatchdog", ThreadWatchdogModule::class.java.name, false, false, false, false,
    ))
  }
}
