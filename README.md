# React Native 白标 App 平台

一个基于 React Native 0.86 + TypeScript 的 bare workflow 白标底座。项目把品牌差异约束在配置、策略/适配器和插件三个边界内，公共代码不需要 `brand === A` 分支。

## 已实现

- 核心底座：HTTP 请求与重试/超时、TTL 缓存、会话鉴权、结构化日志与敏感字段脱敏、同意后埋点、错误/性能监控、国际化、基础原生能力接口。
- 统一模块协议：登录、开户、行情、交易、资产、资讯都通过 `AppModuleFactory` 注册路由、菜单、首页卡片和翻译。
- Brand Config：名称、Logo 引用、主题 Token、品牌文案、功能开关、三套接口环境、合规声明、渠道和原生参数集中在一个 JSON 清单。
- 动态装配：品牌清单控制模块、菜单顺序、登录页/首页布局和起始页；运行期再叠加服务端开关、登录态和用户权限。
- 差异策略：KYC 使用策略；交易供应商使用适配器；高级订单作为完全独立、可从安装包移除的插件示例。
- 原生生成：品牌命令同步 Android application ID、App 名称、Deep Link、渠道和签名入口，以及 iOS Bundle ID、Team、Provisioning Profile、URL Scheme 和商店元数据清单。
- 可配置登录页：品牌可按顺序选择账号密码、手机号验证码和扫码登录入口；账号登录页提供忘记密码入口，登录方式不会出现在 App 首页。
- 扫码登录：独立 `qr-login` 插件提供相机权限引导、二维码扫描、设备确认、倒计时、确认/拒绝和完成状态；相机在离开页面或进入后台时停止。
- 电商模块：商品列表/详情、模块内购物车、订单确认，以及微信支付和支付宝支付跳转与服务端结果确认。

## 快速开始

环境要求：Node.js 22.11+；Android Studio/SDK；构建 iOS 还需要 macOS 与 Xcode。

```bash
npm install
npm run brand:generate -- aurora
npm start
npm run android
```

`npm run android` 会自动发现 Android SDK，并且 Debug 构建默认只编译当前设备 ABI，减少 CMake/NDK 缓存体积。需要一次构建全部 ABI 时使用 `npm run android:all-archs`。若 8081 已有 Metro，则直接复用，避免端口选择提示。Gradle 首次下载允许 120 秒连接时间。若 SDK 位于非标准目录，请设置 `ANDROID_HOME`。

Android 的 CMake 配置会对超长对象路径进行哈希，并在 Windows 将原生临时文件放进用户目录下的短路径，支持较深的仓库目录，无需关闭 React Native New Architecture 或修改系统注册表。可通过 `RN_CXX_BUILD_DIR` 覆盖临时目录。

切换精简品牌：

```bash
npm run brand:generate -- cedar
npm run android
```

`BRAND=cedar npm run brand:generate` 也可用于 CI。Android/iOS 命令执行前会按 `BRAND`（默认 `aurora`）重新生成，避免误打包上一品牌。

## 正式打包

统一打包命令会依次固化品牌、运行环境、版本和构建号，执行品牌校验、TypeScript、ESLint 与 Jest 门禁，再调用原生 Release 构建。默认环境是 `production`，默认产物是经过正式签名的 Android AAB；签名缺失时会直接失败，不会回退到模板 debug key。

```bash
# Google Play AAB
npm run package:android -- --brand aurora --build-number 42

# Release APK
npm run package:android:apk -- --brand aurora --build-number 42

# App Store IPA（仅 macOS）
npm run package:ios -- --brand aurora --build-number 42
```

版本默认读取 `package.json`，CI 可通过参数或环境变量覆盖：

```bash
npm run package:android -- \
  --brand aurora \
  --environment staging \
  --version 1.2.0 \
  --build-number 108
```

优先级为命令行参数 > 环境变量 > 默认值。常用环境变量包括 `BRAND`、`APP_ENV`、`APP_VERSION`、`BUILD_NUMBER`、`BUILD_OUTPUT` 和 `ANDROID_ARCHITECTURES`。版本必须是 1 至 3 段纯数字，构建号必须是 `1..2100000000` 的整数。生成结果会同时传入 JS 运行时、Android `BuildConfig`、iOS 构建设置和埋点版本，避免 Release 包仍连接开发 API 或上报错误版本。

Android 正式签名需要：

```text
BRAND_KEYSTORE_PATH
BRAND_KEY_ALIAS
BRAND_KEYSTORE_PASSWORD
BRAND_KEY_PASSWORD
```

路径和 alias 也可以放在品牌清单的 `native.android.keystorePath` / `keyAlias`，密码只能由环境变量注入。发布构建默认只包含 `armeabi-v7a,arm64-v8a`；可通过 `ANDROID_ARCHITECTURES` 覆盖。

没有正式密钥时，可显式生成仅供安装或流水线验证的无签名包：

```bash
npm run package:android -- --brand aurora --build-number 42 --unsigned
```

无签名产物的文件名含 `unsigned`，构建清单中 `publishable` 为 `false`，不能上传应用商店。打包脚本还会使用 `apksigner` 或 `jarsigner` 核对实际签名状态，防止标签与产物不一致。

iOS 打包会先用 `bundle check` 校验 Ruby 依赖，再运行 CocoaPods，并只使用 `WhiteLabelApp.xcworkspace`。macOS 首次配置时先执行 `bundle install`；发布流水线应提交并复用 `Gemfile.lock` 与 `ios/Podfile.lock`，避免依赖版本漂移。打包需要完整 AppIcon、有效的 `PrivacyInfo.xcprivacy`、真实 Bundle ID 与 Development Team；可通过 `IOS_DEVELOPMENT_TEAM`、`IOS_PROVISIONING_PROFILE` 覆盖品牌配置。默认生成自动签名的 `app-store-connect` ExportOptions，也可传入：

```bash
npm run package:ios -- \
  --brand aurora \
  --build-number 42 \
  --ios-export-options ./secure/ExportOptions.plist \
  --allow-provisioning-updates
```

App Store Connect API Key 使用 `APP_STORE_CONNECT_API_KEY_PATH`、`APP_STORE_CONNECT_API_KEY_ID`、`APP_STORE_CONNECT_API_ISSUER_ID`，三个变量必须同时提供。`--skip-pods`、`--skip-checks` 只用于已完成相同步骤的受控 CI 阶段；`--clean` 可请求全量原生构建。

产物与校验信息写入以下结构，目录已从 Git 排除：

```text
artifacts/<brand>/<environment>/<version>+<build-number>/
├─ android|ios/<brand>-<environment>-<version>-<build-number>-<release|unsigned>.<ext>
├─ android|ios/<artifact>.sha256
└─ build-manifest.json
```

`build-manifest.json` 记录品牌、环境、版本、应用 ID、渠道、模块、Git 源状态、文件大小和 SHA-256，不记录密码或 SDK key 值。同一 checkout 的品牌生成文件是共享的，多品牌打包必须串行执行或使用独立 worktree。

## Bundle 拆分与 OTA

正式构建自动生成 `base.bundle`（Metro 运行时和第三方依赖）与 `business.bundle`（应用、品牌及业务代码）。OTA 提供兼容版本绑定、RSA 签名、完整性校验、下次冷启动生效、启动确认和失败回滚；未配置公钥时禁用在线安装。

使用 `npm run bundle:android` / `npm run bundle:ios` 验证拆包，使用 `npm run ota:release -- ...` 生成签名业务版本。原生包的拆包 baseline 随打包产物归档到 `<platform>/bundles/`。公钥配置、发布命令、客户端 API 和 Hermes 加载取舍见 [`docs/ota.md`](docs/ota.md)。

## 分层

```text
src/
├─ core/                 请求、缓存、鉴权、日志、埋点、监控、i18n、原生能力
├─ brand/                Brand Config 类型
├─ modules/              统一协议、注册器及六个领域模块
├─ strategies/           流程策略和供应商适配器
├─ plugins/              完全独立业务插件
├─ app/                  功能门控、应用装配、运行容器和 UI Shell
└─ brands/generated/     构建期生成的唯一品牌入口
brands/<brand>/          品牌清单
scripts/                 校验和原生/JS 入口生成
generated/native/        CI 与原生工程使用的生成结果
```

关键数据流：

```text
品牌模块清单（构建期静态 import）
        ↓
统一模块注册器
        ↓
品牌功能开关 ∩ 服务端开关 ∩ 登录态/用户权限
        ↓
路由 + 菜单 + 首页布局
```

构建期生成的 `activeBrand.ts` 只静态导入该品牌选择的模块。例如 Cedar 不导入交易、资产和高级订单，因此这些业务不会进入它的 JS Bundle。运行期门控只能隐藏已经进入安装包的能力，不能把未打包代码“打开”。

## 扫码登录协议

需要扫码能力的品牌应同时在 `assembly.modules` 中加入 `qr-login`，并打开 `features.qrLogin`。生成器会为该品牌链接 VisionCamera/Nitro 原生依赖，并加入 Android/iOS 相机权限。Cedar 未选择该插件，因此生成时会禁用这些原生依赖并移除相机权限声明。

二维码只允许携带短时、一次性的不透明 nonce，不信任二维码中的设备、位置或失效时间：

```text
aurora://qr-login?challenge=<16-256 位 nonce>
https://invest.aurora.example/qr-login?challenge=<16-256 位 nonce>
```

App 扫描后通过已登录会话调用以下接口：

```text
POST /v1/auth/qr-login/resolve  { challengeId }
-> { challengeId, deviceName, location?, expiresAt }

POST /v1/auth/qr-login/confirm  { challengeId }
POST /v1/auth/qr-login/reject   { challengeId }
```

`resolve` 返回的 challenge 必须与扫描值一致，且剩余有效期不能超过 5 分钟；确认与拒绝应由服务端保证用户绑定、一次性和幂等。所有三个接口都要求 Bearer Token，无有效 Session 时 HTTP 底座会在发送请求前拒绝。账号密码、手机号验证码和忘记密码页面当前提供表单交互，接入真实认证接口后应通过 `services.session.setSession(...)` 建立会话。

Debug 包的扫码页提供“开发环境：模拟扫码”，可在没有测试二维码时检查确认页。iOS 扫码依赖要求 deployment target 15.5 且需真机验证；Android 模拟器可在 Camera 的 Virtual Scene 中导入二维码图片。

## 埋点

底座提供同意门控、自动生命周期/页面/HTTP/错误/性能采集、用户关联、自定义事件、批量上报和失败重试。事件协议、接入示例及服务端格式见 [`docs/analytics.md`](docs/analytics.md)。

## 新增品牌

1. 复制 `brands/aurora/brand.config.json` 到 `brands/<id>/brand.config.json`。
2. 修改主题、文案、环境、合规、装配和原生配置。
3. 执行 `npm run brand:validate`。
4. 执行 `npm run brand:generate -- <id>`，检查 `generated/native/brand-manifest.json`。
5. 在 CI 注入签名和第三方 SDK 密钥，再构建商店包。

新增领域模块时实现 `AppModuleFactory`，并把模块的构建期映射加入 `scripts/brand-utils.ts`。独立插件也遵守同一注册协议，但目录放在 `src/plugins`，公共模块不得反向依赖它。

## 国际化

品牌通过 `defaultLocale`、`supportedLocales` 和 `copy` 定义默认语言、可切换语言与品牌级文案；领域模块通过 `translations` 提供自己的同构词典。多语言品牌会在应用标题栏显示语言切换入口，切换后当前页面、表单和导航状态保持不变，界面文案、无障碍标签、金额格式及埋点 locale 会同步更新。单语言品牌不会显示无意义的切换入口。

翻译查找顺序为当前语言、品牌默认语言、原始 key。`npm run brand:validate` 会检查每个受支持语言都存在品牌词典，并阻止品牌级词典缺 key。新增模块文案时应同时补齐该模块支持的所有语言。

## 原生与密钥

- Android keystore 路径和 alias 可写入品牌清单；密码只能通过 `BRAND_KEYSTORE_PASSWORD` 与 `BRAND_KEY_PASSWORD` 注入。缺失时 debug 构建回退到模板 debug 签名，正式发布流水线应对该情况直接失败。
- iOS Bundle ID、Development Team、Provisioning Profile 由生成器同步到 Xcode 工程；证书私钥由 Keychain/CI 管理，不进入 Git。
- `sdkKeys` 允许保存 `${ENV_NAME}` 占位符。生成的 manifest 仅输出 key 名，不输出值，实际值应由 CI、`.xcconfig` 或原生 secret provider 注入。
- Logo 当前是资产引用位；各品牌应提供 Android mipmap 与 iOS AppIcon 资产，流水线可在品牌生成阶段覆盖模板资源。

## 质量检查

```bash
npm run brand:validate
npm run typecheck
npm test
npm run lint
```

测试覆盖模块注册冲突、构建/运行功能门控、装配顺序、缓存过期和 App 渲染。

## 电商与支付接口

`commerce` 模块进入时自动请求商品列表，每页 20 条，滚动到底部或点击「加载更多」继续分页。下拉刷新重新读取第一页，点击商品后单独请求详情。请求失败支持重试，不回退到前端演示商品。

商品接口已对接 [本地 Swagger 文档](http://localhost:3000/docs#/)，匿名访问：

```text
GET /api/v1/products?page=1&pageSize=20
GET /api/v1/products/:id
```

成功响应为 `{ code: "SUCCESS", data, message, requestId, timestamp }`；列表的 `data` 为 `{ items, page, pageSize, total }`，详情的 `data` 为单个商品。`categoryName` 映射分类，`basePrice` 十进制字符串转换为分。缺失图片显示占位，缺失描述显示空说明。当前接口未提供库存，客户端将其记录为未知并保留本地选购，实际可售数量仍由下单服务校验。

当前 Aurora 的 `development.apiBaseUrl` 配置为 `http://localhost:3000`。Android 调试需将所用设备端口反向转发至本机（`adb -s <设备序列号> reverse tcp:3000 tcp:3000`）；iOS 模拟器可访问本机 localhost，真机需在对应品牌环境中配置可达的后端地址。其他品牌及 staging/production 地址仍通过各自 `brands/<品牌>/brand.config.json` 配置。

订单和支付仍使用现有契约，尚未对接此后端的订单、SKU 或支付接口：

```text
POST /v1/commerce/orders
POST /v1/commerce/payments
POST /v1/commerce/payments/status
```

创建支付请求体包含 `{ orderId, provider, idempotencyKey }`，返回 `{ id, orderId, provider, redirectUrl, status }`；查单请求体包含 `{ paymentId }`。微信采用 H5 收银台，`redirectUrl` 仅接受 `https://wx.tenpay.com`；支付宝仅接受 `alipays://` 或支付宝官方 HTTPS 域名。服务端负责金额和库存复算、幂等下单、签名、异步通知验签；客户端在回到前台后查询服务端状态，不信任跳转参数作为支付成功依据。订单与支付接口要求有效 Bearer Token。

## App 更新查询入口

在品牌配置的 `environments.<environment>` 中设置可选的 `otaQueryUrl`，值为平台的完整 HTTPS 查询地址，例如 `https://updates.example.com/v1/apps/<app-UUID>/updates`。不配置时首页仍显示“检查更新”，点击会提示未开放在线更新；不要把平台管理员 token 放进 App。

首页入口读取原生 OTA 状态，以 `max(currentVersion, highestVersion)` 查询，避免重新推荐已经失败或暂存的版本。显示检查中、暂无更新、发现更新、待重启、不支持和失败状态。本次入口只查询，不自动下载或安装；既有 `ota.stage()` 的签名与兼容性校验流程保持不变。
