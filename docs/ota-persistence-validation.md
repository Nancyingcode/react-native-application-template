# OTA 状态持久化修复验证

日期：2026-09-09。基于 `8420efb4b59e24e17c9f7489f22803385363ead6` 的隔离工作树未提交修改。仅修复客户端持久化一致性，没有开发 OTA 平台、提交、推送或生产发布。

## 修改

Android `OtaStore.kt` 与 iOS `OtaBundle.swift` 的保存函数接收候选状态，写入成功后才替换内存状态。覆盖 stage、trial 启动、未确认回退、损坏包回退和 markSuccessful。

- stage 保存抛错后，pending/highest 不变；故障解除后同进程可重试。
- markSuccessful 保存抛错后保留 trial；可重试确认，或下次启动按未确认版本回退。
- selectBundle 保存抛错后返回内置包，运行版本为 0；不提交未保存的回退字段，不执行清理。该进程的选择保持不变，下次冷启动重读持久状态并恢复。
- API、状态文件字段、Manifest、签名、兼容性、版本水位与 trial 规则保持兼容。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过，两份 TypeScript 配置 |
| `npm run lint` | 通过 |
| `npm test -- --no-cache --cacheDirectory=artifacts/jest-cache` | 通过，34 suites / 461 tests |
| `gradlew :app:assembleRelease -PreleaseSigningMode=unsigned -PreactNativeArchitectures=x86_64 --console=plain` | 通过，290 tasks，含实际 Kotlin、Metro 拆包与 Hermes 编译 |
| API 36 模拟器，实际 Release APK 内 OtaStore | 26 项通过：原 P0 19 项 + 持久化回归 7 项 |
| 两个独立 app_process | 2 项通过：确认保存失败留存 trial，下一进程恢复上一版本且最高版本不下降 |
| 旧 P0 APK 负向对照 | 原 19 项通过，新增持久化检查报 `AssertionError: memory changed: pending`，证明能检出原缺陷 |
| iOS 原生编译和运行 | **未验证**，当前环境为 Windows，无 macOS/Xcode |

Android 构建环境：aurora / development / direct，1.0.0+1，x86_64 unsigned Release。APK SHA-256：`1E5A88A0763965F5A130651EF93610A906C7C2005D63D3B5A5082E3E26E53B2F`。

本次本地原始记录（在 Git 忽略的 artifacts 下）：

- `artifacts/ota-android-build.log`
- `artifacts/ota-native/ec546f7b4e80464497c19867cbb75d26/results.txt`
- `artifacts/ota-native/ec546f7b4e80464497c19867cbb75d26/apk-sha256.txt`
- `artifacts/ota-native-before.log`

复跑入口和覆盖说明见 [原生回归说明](../tests/native/ota/README.md)。测试只替换资源 Context、HTTPS 和指定的 AtomicFile 写入故障，执行的是 APK 中真实 OtaStore，不是单独状态机模型。

首次新增回退故障用例在创建 store 之前注入 `.new` 目录，被 AtomicFile.openRead 清理，未实际触发写入故障；已改为读取状态后注入并重跑通过。依赖安装首次受沙箱 spawn EPERM 阻止，确认无当前工作树依赖占用进程后重试成功。构建有现有第三方原生代码/Gradle 弃用警告，没有通过修改配置隐藏。

## 剩余验证边界

- iOS 仅完成对应代码修改和静态检查；Security 验签、Foundation 原子写入异常、trial 恢复必须在 macOS/Xcode 补测。
- `.new` 目录与定点 IOException 是写入失败注入，不能代表真实磁盘满、断电或文件系统硬件故障。
- 跨进程检查直接运行原生 store，不代表完整 App 强杀、Hermes 加载 OTA 业务或真实 HTTPS/TLS 端到端验证。
- 没有执行生产签名、ARM64 真机和生产就绪验收。原 P0 报告的其他未验证项仍然存在。
