package com.whitelabelapp.ota

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.concurrent.Executors

class OtaModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val store = OtaStore.get(context)
  private val executor = Executors.newSingleThreadExecutor()
  override fun getName() = "OtaBundle"
  override fun getConstants(): Map<String, Any> = mapOf("assetRoot" to "android-resources")
  private fun run(promise: Promise, operation: () -> Any) {
    executor.execute { try { promise.resolve(operation()) } catch (error: Exception) { promise.reject("OTA_ERROR", error.message, error) } }
  }
  @ReactMethod fun getStatus(promise: Promise) = run(promise) { store.status() }
  @ReactMethod fun stage(url: String, promise: Promise) = run(promise) { store.stage(url) }
  @ReactMethod fun markSuccessful(promise: Promise) = run(promise) { store.markSuccessful() }
  override fun invalidate() { executor.shutdown(); super.invalidate() }
}

class OtaPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == "OtaBundle") OtaModule(reactContext) else null
  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf("OtaBundle" to ReactModuleInfo("OtaBundle", OtaModule::class.java.name, false, false, false, false))
  }
}
