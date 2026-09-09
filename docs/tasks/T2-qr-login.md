# T2：新版二维码手机授权

## 基线与范围

- 2026-09-09，当前 worktree 从干净的 `d48d261` 快进到用户同步的本地 master `b9f942b18694ef2095a49234ad12e6704f59532a`。未 commit/push。
- 已阅读 AGENTS.md、design.md、两份 Swagger 并行文档、旧扫码解析/页面/插件/测试，以及公共 HTTP、会话、导航和相机能力。
- 冻结 Swagger：`artifacts/swagger-latest.json`，从主工作区复制忽略文件后核对 SHA-256：`23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`。未替换成在线新版本。
- Swagger 未声明 type 字面量。只读核实本地 `mobile-mall-backend/src/modules/auth/application/qr-login.service.ts:44`：`type: 'qr-login'`；后端 HEAD `c15ab6e8ba00211bb66186ee028241d818fd41a1`，该文件无未提交修改，文件 SHA-256 `506cca7264f4fe0979d0503567d27206fd03e348f7e48ec8ab91108a6510b45f`。
- `global-rules/AGENTS_condition_rules.md` 仍缺失，未自行补造公共状态规则。
- 本次仅改 T2 两个 auth 文件、qr-login 插件、所属 `qrLogin` / `qrAuthorization*` 测试及本文。未修改 core、聚合入口、app、品牌、T1 目录、依赖声明或 lock。

## 新旧协议差异与导出

| 旧实现 | 本次实现 |
| --- | --- |
| 品牌 URL + challenge nonce | 严格 JSON 对象：仅 type/sessionId/scanToken 三字段 |
| resolve / confirm / reject | POST `/api/v1/auth/qr-login/{id}/scan`、`confirm`、`cancel` |
| body.challengeId、裸响应 | body.scanToken，响应仅解包一次 data |
| 设备名、位置、秒/毫秒期限猜测 | 服务端 UUID sessionId、五种状态、date-time expiresAt；中性授权说明 |
| 本地成功即跳成功页 | 按服务端实际状态展示；CONFIRMED 不表示电脑已兑换 |
| 开发按钮构造假设备直接进入确认 | 删除绕过 scan 的演示入口；测试通过扫码回调和真实网关注入 mock |

`src/modules/auth/qrLogin.ts` 导出：

- `parseQrLoginPayload(raw): QrLoginRequest`，64 位小写十六进制 scanToken，UUID 格式 sessionId；拒绝非法 JSON、额外字段（包括 pollToken、URL）、旧 URL、非字符串与超长数据。错误只包含固定代码。
- `QrLoginRequest { sessionId, scanToken }`、`QrLoginChallenge { sessionId, status, expiresAt }`；expiresAt 映射为绝对毫秒时间。
- `QrLoginStatus = PENDING | SCANNED | CONFIRMED | CANCELLED | CONSUMED`，没有添加 EXPIRED 后端枚举。
- `createQrLoginGateway(http): QrLoginGateway`，三个方法均接收 QrLoginRequest、返回 QrLoginChallenge；固定请求路径，authenticated:true、retry:0，不请求电脑 status/exchange，不写手机会话。
- `validateQrLoginResponse` 校验包装、请求/响应会话一致、状态、时区与合法日历日期；不接受 Date.parse 自动修正的无效日期，不强加旧五分钟期限。
- `qrLoginErrorKey` 映射已声明错误、鉴权、限流和未知结果；不显示后端原始 message。

页面内部状态 Hook 位于 `src/plugins/qr-login/useQrAuthorization.ts`，不是新的会话管理器。所有电脑端创建、查询和兑换代码仅存在于所属 HTTP mock 测试。

## 状态、并发与恢复

- 同步 ref 锁先于 React 渲染，连续识别只发一次 scan；确认与取消共用操作锁，忙碌时两个按钮均禁用并提供 accessibilityState。
- SCANNED 才能确认/取消；PENDING 显示当前操作不被允许；CONFIRMED、CANCELLED、CONSUMED 分别显示服务器授权、取消、已消费结果。业务失败不伪造这些终态。
- 倒计时以固定截止时间计算；后台返回立即重新计算，点击操作时再校验。后续响应改变截止时间视作结果未知。已确认响应即便晚到也按服务端结果展示，而不以本地等待时间推翻它。
- 网络、超时、5xx、无法校验的成功响应显示结果未知，停止该流程。不调用 status，不自动重发 scan/confirm/cancel。当前挂载周期记住已尝试的会话 ID，重新扫描要求电脑生成新的码。
- 后端源码只允许同账号 SCANNED 重复 scan，不能用 scan 恢复 CONFIRMED/CANCELLED/CONSUMED；本次保守地不实现恢复查询。重新挂载后的显式扫码仍由后端校验，不宣称任意 scan 幂等。
- 离页/重扫增加请求代次；旧完成和旧失败均不能更新当前页面。返回首页先卸载授权区域，不自动 cancel。
- 订阅 SessionManager；手机会话替换时清除局部凭证并停止流程，同账号退出重登亦失效。公共层没有登录代次，当前保守策略也会中断正常 Token 刷新，需重新在电脑生成码。
- 不持久化、不记录二维码或 Token；不将原始请求异常送入页面监控/埋点。T2 不覆盖手机 SessionManager。

## 翻译和 T12 装配

翻译仍由 `qrLoginPlugin.create(context).translations` 提供 zh-CN/en-US，属于 T2 原有边界，不需要新的全局翻译文件。新增 auth.qr.back、rescan、result.title、cancelled.*、consumed.*、error.unknown/owner/status/auth/accountChanged/rate/used；旧演示/设备名/位置/网络重试文案已清除。

沿用插件 QrLogin 路由、qrLogin feature、requiresAuth:true 和 T0 现有注册。T12 无需为本次新增页面/路由；需保证插件翻译正常装配，并保留手机已登录保护。测试直接使用该插件翻译与页面，不占用公共入口。

### T12 必须解决或确认的公共缺口

1. **二维码 401 不应清除手机会话。** Swagger 的 QR_LOGIN_INVALID 是 401；HttpClient 在解析业务 code 前会刷新并重发，最终 401 还会 invalidateAccessToken。这会让坏二维码触发手机刷新/退出，并可能覆盖页面针对二维码无效的提示。retry:0 不影响该路径。需要公共层先区分 QR_LOGIN_INVALID 与 TOKEN_INVALID/UNAUTHORIZED，再决定刷新/清会话；也需明确副作用接口 401 后重放策略。本次不修改 core，也不通过 authenticated:false 另写鉴权流程。上线前必须补该场景的真实 HttpClient 回归。
2. **会话归属/发送边界。** 当前只能观察 getSnapshot/subscribe，不能读取登录意图代次；任何快照替换均保守中断。若要刷新后继续原授权，请提供能区分同次续期和新登录的公共代次，并在 HTTP 获取 Token 后、首次发送及 401 重发前校验请求归属。局部代次保证 UI 迟到响应隔离，不宣称能撤销已发请求。
3. **日志深度脱敏。** HttpClient 的错误日志携带整个 error；ConsoleLogger 只检查顶层字段，后端若在 message 中回显凭证，局部网关无法阻止公共层先记录。公共负责人需让 HTTP 错误日志仅保留安全 status/code/requestId 或做深度脱敏。正常响应未回显凭证，T2 自身无原始异常日志。
4. 3002 mock 与真实环境 apiBaseUrl 属于品牌/服务装配负责人。生产代码继续接收 services.http，不在网关硬编码 localhost。Android 模拟器访问宿主 3002 需现有环境配置使用可达地址或 adb reverse，不能把本机 localhost 当成所有手机的地址。

## 验证结果

验证使用 npm；安装前检查当前 worktree 无相关运行进程，首次 `npm ci --ignore-scripts` 完成（872 packages，lock 未改），随后执行项目检查。

- `npm run typecheck`：通过。
- `npm run lint`：通过，零错误、零警告。
- `npm test -- --watch=false`：29 个套件、404 项测试全部通过，其中 T2 所属 4 个套件共 104 项。
- 所属四个测试文件：解析/网关/错误码、授权 Hook 竞态、实际页面/相机适配回归、本地 HTTP mock 闭环。
- `npm run bundle:android` / `npm run bundle:ios`：首次沙箱 spawn EPERM，获得构建执行权限后成功；最终代码修改后再次执行，两平台均 exit 0。JS Bundle 不是原生构建验收。
- 两品牌、中英文的组件渲染和交互测试通过；确认/取消互斥、加载、错误、过期、权限拒绝、系统设置、无相机、后台返回、重复识别、重新扫描、返回、迟到响应、账号切换均有所属测试。组件树断言不等于截图视觉验收。

### 3002 与独立 HTTP mock 的区别

2026-09-09 访问 `http://127.0.0.1:3002/api/v1/health/live` 返回 200；以不含登录凭证的专用创建请求访问 `/api/v1/auth/qr-login`，当前响应的 qrCodeContent 和 pollToken 都为空字符串，status 为 CANCELLED，无法生成合法扫码载荷。只记录字段形态，不输出完整响应。未修改或重启该服务、未向它提交真实手机凭证。

`qrAuthorizationHttp.test.ts` 自带一个仅绑定 127.0.0.1 临时端口的有状态 HTTP mock，凭证随机生成并只存在内存。它通过实际 HttpClient 和网关验证：创建 → 手机扫描 → 手机确认 → 电脑查询 → 一次性兑换；另测重复兑换、取消后无法兑换、过期、非本人、scanToken/pollToken 分离。该 mock 只模拟本任务需要的契约，不是后端实现的正确性证明。

单独运行：`npm test -- --watch=false qrAuthorizationHttp`。不占用现有 3002，也不包含真实账号、生产凭证或部署入口。

### 未完成的验收

- 真实后端专用账号跨端联调未完成；当前 3002 空样例不能作为有效协议闭环。
- 原生真机/模拟器真实扫码、权限弹窗、截图 Visual QA 未完成。检查时 adb devices 为空；现有 AVD 配置不代表已验证当前页面。未把测试渲染器当成真实页面截图。
- 375/768/1024/1280/1440/1920 的真实布局、键盘 Focus、两品牌中英文完整状态截图矩阵仍需原生可运行环境验收。页面沿用已有主题和扫描器，确认/结果区域可滚动、主要内容及按钮限制宽度，但静态审查不替代上述验收。
- T12 公共 401/会话发送归属/错误日志缺口未修复前，本交付不能标为生产安全验收完成。
