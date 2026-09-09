# OTA 原生持久化回归

基于 P0 `OtaNativeProbe.java` 扩展，直接通过 Android `app_process` 加载 Release APK 内的实际 `OtaStore`。没有复制状态机，没有修改生产 API 或为测试放宽签名/兼容性检查。

在 Windows、JDK 17、Android SDK 36 和已启动的 API 36 模拟器上，从项目根目录执行：

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA/Android/Sdk"
Push-Location android
.\gradlew.bat :app:assembleRelease -PreleaseSigningMode=unsigned -PreactNativeArchitectures=x86_64 --console=plain
Pop-Location
./tests/native/ota/run-android.ps1 -Serial emulator-5554
```

脚本支持 `-Sdk` 和相对于项目根目录的 `-Apk`。测试资源、临时签名公钥、结果和被测 APK 校验和写入 `artifacts/ota-native/<随机目录>/`；临时私钥仅存在于生成器内存。模拟器 fixture 使用独立的 `/data/local/tmp/ota-regression-<随机值>` 目录，保留用于排查。

覆盖：

- 原 P0 的正常暂存、确认、重建恢复、未确认回退、防重放、更高版本恢复、损坏包回退，以及签名/品牌/base/平台/环境/hash/长度/网络/重定向拒绝。
- `state.json.new` 目录注入保存失败，检查磁盘与实际内存全部状态字段不变；解除故障后同一实例重试 stage，并重建验证。
- pending → trial 和 trial → 回退保存失败，检查返回内置包、当前版本为 0、保留 pending/trial，且下次启动恢复。
- 确认失败保留 trial；同进程确认重试成功；未重试则重建后回退。
- 损坏当前包时第二次状态写入失败，分别覆盖上一版本有效和也损坏两条路径；通过反射替换 `AtomicFile`，只让第二次 `startWrite` 抛 IOException，仍执行原生选择/校验/回退代码。
- 两个独立 `app_process` 先留下确认失败的 trial，再读取并恢复上一版本，验证跨进程恢复。

边界：Context 的资源/目录和 HTTPS 响应是替身；故障注入是写入异常，不是真实磁盘满。反射只用于测试观察内存及精确定位第二次写入。该测试不覆盖真实 TLS、Hermes 执行 OTA、App 强杀/断电，也不替代 iOS macOS/Xcode 原生验证。
