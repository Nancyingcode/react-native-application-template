# Bundle 拆分与 OTA 版本管理

## 拆分边界

Release 构建统一经过 `scripts/bundle-cli.js` 和 Metro serializer，输出：

| 产物 | 内容 | 更新方式 |
| --- | --- | --- |
| `base.bundle` | Metro 运行时、polyfill、当前应用依赖图中的 `node_modules` 模块 | 随原生安装包更新 |
| `business.bundle` | 入口、品牌配置、`src/core`、应用容器、业务模块和插件，以及启动入口调用 | OTA 更新 |
| `bundle-manifest.json` | 原生兼容性、base 指纹、业务包大小和 SHA-256 | 随对应构建归档 |
| `module-map.json` | 模块路径、稳定 ID、所属 bundle | 排查拆包边界 |
| `*.bundle.map` | base、业务包及组合包的 source map | 私有符号服务器归档 |

模块 ID 根据项目相对路径生成，与遍历顺序无关，并检测 ID 冲突。base 不得反向依赖业务代码。新增或移除第三方依赖如果改变 base，会要求重新打原生包；不能靠增大 OTA 版本号绕过兼容检查。

拆分使用 [Metro serializer 配置](https://metrobundler.dev/docs/configuration/#serializer-options)。组合 serializer 和资源定位适配器依赖锁定版本的 Metro/RN 内部实现；升级依赖后必须重新执行拆包测试和设备验证。

## 加载方式与 Hermes

Android 和 iOS 的正常 Release 构建都会产生两个源代码 bundle，并额外保留标准 Hermes 编译的完整启动包，作为内置版本 `0`。Debug 继续使用 Metro，不应用 OTA。

有 OTA 时，原生在创建 React runtime 之前校验业务包，将**安装包内的 base 源码 + 换行 + OTA 业务源码**组合为本地启动文件，再交给 Hermes 执行。只有一份 Metro runtime，没有二次初始化，也不使用旧架构的 bridge 加载接口。Hermes bytecode 不参与拼接。

这是物理产物拆分与增量分发，不是两个 Hermes bytecode 的独立加载。代价是安装包额外保留拆分源码，OTA 冷启动需要校验、组合和解析源码；默认启动仍使用预编译的 Hermes 包。后续若需要优化冷启动，应以设备性能测量为依据接入 RN 新架构的原生多 bundle loader。

当前 OTA 只支持 JavaScript 更新：本地图片等资源必须与内置版本完全相同。资源指纹变化时构建失败；OTA 启动后资源继续从安装目录/Android resources 解析，不会错误地从下载目录寻找图片。需要变更原生依赖、权限、原生配置、本地资源时，应发布新的原生版本。

## 版本与兼容性

- `appVersion` / `buildNumber`：商店版本和原生构建号。
- `baseVersion`：base 源码的 SHA-256，内容变化即版本变化。
- `nativeFingerprint`：对应平台原生源码/配置、锁文件、原生品牌清单的指纹。
- `assetsFingerprint`：Metro 资源模块的指纹。
- `runtimeVersion`：平台、品牌、环境、渠道、原生版本及上述指纹组成的兼容性版本。
- `bundleVersion`：每个 runtime 内单调递增的整数 `1..2100000000`；`0` 保留给内置业务包。

客户端和发布工具都要求平台、品牌、环境、渠道、appVersion、buildNumber、base、原生和资源指纹完全一致。客户端在启动 OTA 代码**之前**执行这些检查，不依赖待更新的 JS 自己判断安全性。

## 原生包准备

CI 保管 RSA 私钥，至少 2048 位。公钥可以公开，私钥不得提交到仓库或分发给客户端。可在 CI/安全目录生成：

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out ota-private.pem
openssl pkey -in ota-private.pem -pubout -out ota-public.pem
```

通过 `OTA_PUBLIC_KEY_FILE` 指定公钥再执行已有正式打包命令，例如 PowerShell：

```powershell
$env:OTA_PUBLIC_KEY_FILE = 'C:\secure\ota-public.pem'
npm run package:android -- --brand aurora --build-number 42
```

iOS 同样使用此环境变量，通过现有 `package:ios` 命令打包。没有设置公钥时仍会拆包，但客户端 OTA 明确禁用，`ota.getStatus().supported` 为 `false`，不会接受未签名更新。公钥轮换需要新的原生安装包和构建号。

正式产物目录会增加：

```text
artifacts/<brand>/<environment>/<version>+<build-number>/<platform>/bundles/
  base.bundle
  business.bundle
  bundle-manifest.json
  public-key.pem
  base.bundle.map
  business.bundle.map
  combined.bundle.map
  module-map.json
```

请把这整个目录作为对应原生包的**不可变 baseline**归档。不要使用 `artifacts/bundles/<platform>` 作为 baseline，该目录是每次构建都会覆盖的工作目录。

仅验证 JavaScript 拆包，不构建原生安装包：

```bash
npm run brand:generate -- aurora
npm run bundle:android
npm run bundle:ios
```

这些命令使用当前生成的品牌、环境和原生版本；需要调整时先执行 `brand:generate` 的对应参数。Android Gradle 和 iOS Xcode Release 构建已自动接入相同流程，不必手工复制 bundle。

## 生成 OTA 发布版本

修改业务代码后，传入实际已发布原生包的 baseline：

```bash
npm run ota:release -- \
  --baseline artifacts/aurora/production/1.0.0+42/android/bundles \
  --bundle-version 1 \
  --business-url https://cdn.example.com/aurora/android/42/1/business.bundle \
  --private-key /secure/ota-private.pem \
  --notes "修复行情展示" \
  --output artifacts/ota
```

命令会按 baseline 恢复品牌/环境/原生版本，执行 typecheck、lint、test，重建候选包，对比兼容性与文件完整性，确认私钥匹配原生公钥，然后输出：

```text
artifacts/ota/<runtimeVersion>/<bundleVersion>/
  business.bundle
  release.json
  bundle-manifest.json
  business.bundle.map
  combined.bundle.map
  module-map.json
```

只需将 `business.bundle` 上传到命令指定的 HTTPS 地址，将 `release.json` 上传到版本化的 HTTPS 地址。`release.json` 包含 `payload`（原始 manifest JSON 字节的 Base64）和 `signature`（RSA-SHA256 / PKCS#1 v1.5 签名的 Base64），签名同时绑定版本、目标环境、文件 URL、大小和哈希。客户端固定使用安装包内的公钥验签。

此命令只创建本地产物，不会上传 CDN 或发布服务。当前项目未配置更新服务，应用侧应从自己的可信更新接口取得与 `runtimeVersion` 匹配的 `release.json` URL。CDN 必须直接返回 HTTPS 200；客户端不跟随重定向。manifest 上限 64 KiB，业务包上限 20 MiB。

本地发布目录有排他锁并禁止覆盖、降序版本。CI 应共享持久化输出目录，或由外部制品库原子地约束 `(runtimeVersion, bundleVersion)` 唯一和单调递增。失败发布可能留下已占用的版本目录；使用更高版本重试，不复用已占用版本。异常终止留下 `.release.lock` 时，先确认没有发布进程，再由流水线恢复锁。

## 客户端使用

```ts
import { ota } from './src/core/ota';

const status = await ota.getStatus();
// 将 status.runtimeVersion 和 status.highestVersion 发给你的更新服务。
if (status.supported && status.pendingVersion === 0) {
  await ota.stage('https://cdn.example.com/aurora/android/42/1/release.json');
}
```

`stage` 返回已暂存的版本号，不中断当前会话，也不会自行重启 App。下载、验签、兼容检查、SHA-256 和长度校验全部成功后，才持久化 pending 版本。下载中断、磁盘写入失败或验签失败会拒绝 Promise，当前版本继续运行。

`getStatus()` 返回 `supported`、`runtimeVersion`、`baseVersion`、`currentVersion`、`pendingVersion`、`previousVersion`、`failedVersion`、`highestVersion`。不要自动高频重试已拒绝的版本。

状态变更仅在状态文件保存成功后提交到内存。`stage` 保存失败不会占用 pending 或提高 highest，存储故障解除后可在同一进程重试；确认保存失败会保留 trial，可重试确认，未确认就退出则下次启动仍执行回退。启动选择或回退的状态保存失败时，本次进程固定使用内置包（`currentVersion = 0`），保留已持久化的状态和版本文件供下次冷启动恢复，不在运行中切换 bundle。

## 试运行与回滚

```text
内置/已确认版本
  → 下载并校验
  → pending（当前会话不变）
  → 下次冷启动：先持久化 trial，再加载 OTA
  → 首次 UI 提交且模块初始化完成：markSuccessful
  → 已确认版本，保留上一成功版本

trial 未确认就退出/崩溃
  → 下次冷启动恢复上一成功版本
  → 记录 failedVersion，highestVersion 不下降
```

`ApplicationProvider` 已在模块初始化成功且仍挂载时调用 `ota.markSuccessful()`。新增启动检查应放在这个确认点之前；不要在入口文件执行时提前确认。试运行中强制杀进程也会被保守地视为失败。启动前发现本地文件损坏时会直接尝试上一成功版本，最终退回安装包内版本。

客户端保留当前、上一成功和待启动版本，清理同一 runtime 内的其他版本文件；OTA 数据不参与系统备份。失败版本和旧版本不能再次通过 `stage` 安装，避免崩溃循环和旧包重放。若需主动回滚已确认的业务逻辑，恢复旧业务源码并用**更高的 bundleVersion**重新签名发布，保留完整审计链路。

## 验证要求

自动测试覆盖稳定模块 ID、运行时仅初始化一次、base 反向依赖拒绝、签名绑定/篡改、兼容性、单调发布版本、URL 与业务文件完整性。Android/iOS 拆包构建还应在 CI 中执行。

发版前应在两端 Release 设备上验证：正常更新并确认、首次启动抛错后下次启动回滚、试运行强制杀进程、断网/截断下载、错误签名、不匹配的 base/品牌/环境、原生覆盖升级，以及实际本地图片的加载。iOS 原生编译和签名打包必须在 macOS/Xcode 完成。
