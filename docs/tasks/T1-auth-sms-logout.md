# T1：短信登录与服务端退出

## 基线与边界

- 已按用户授权通过 SSH 拉取 master，并从 `d48d261` 快进至 `b9f942b`；开始时工作区干净。
- 已核对 T0 拆分、任务清单、公共契约、认证响应校验、会话服务及原有认证测试。
- 冻结快照从主工作区 `artifacts/swagger-latest.json` 读取，SHA-256 为 `23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`，与 T0 一致；没有更新快照。
- 状态规则实际位于 `C:/Users/30728/.codex/global-rules/AGENTS_condition_rules.md`，相对于全局 AGENTS.md 解析，已读取。
- 没有改公共聚合入口、个人资料、app、品牌、全局翻译、其他任务代码、lock 文件；没有新增依赖、commit 或 push。

## 导出与 T12 接入

| 文件 | 导出 / 用途 |
| --- | --- |
| `src/modules/auth/sms/PhoneLoginScreen.tsx` | `PhoneLoginScreen`，沿用现有签名，T0 的兼容导出及 PhoneLogin 路由已自动接入 |
| `src/modules/auth/sms/useSmsLogin.ts` | `useSmsLogin`，表单、意图保护、截止时间、AppState 更新和错误状态 |
| `src/modules/auth/sms/repository.ts` | `SmsRepository`、`SmsCodeTiming`、`isValidPhone`、`isValidCode` |
| `src/modules/auth/sms/translations.ts` | `smsTranslations`，现有 auth 入口自动组合中英文 |
| `src/modules/auth/logout/LogoutButton.tsx` | `LogoutButton`，独立退出按钮、确认 Modal、进行中及结果反馈 |
| `src/modules/auth/logout/useLogout.ts` | `useLogout`，将确认绑定到发起时会话，防重复与迟到 UI 更新 |
| `src/modules/auth/logout/service.ts` | `logoutSession(http, session, expected)`，返回 `revoked / unconfirmed / sessionChanged / localFailed` |
| `src/modules/auth/logout/translations.ts` | `logoutTranslations`，由 T12 合入 auth 中英文目录 |

T12 在个人资料页挂载 `<LogoutButton />` 并组合 `logoutTranslations`。退出组件不主动导航；宿主应在本地退出后仍保留结果展示区域，直到远端请求结束。若宿主必须立即切换路由，应通过 `logoutSession` 将结果交给跨页面反馈区域，不要在卸载组件后丢失“远端撤销未确认”的提示。当前组件取消确认没有副作用；会话在确认期间改变后，旧确认不会退出新会话。

所有业务请求使用注入的 `services.http`，没有在生产代码硬编码 mock 地址。3002 已用于测试夹具和手动 smoke 脚本；实际 App 的 `apiBaseUrl` 仍由 T12/品牌装配负责（Android 模拟器访问主机需 `http://10.0.2.2:3002`）。本任务未越界更改品牌配置。

## 短信行为

- 匿名 `POST /api/v1/auth/sms/code`，body 为 `{ phone }`；`retry: 0`，不会触发鉴权刷新重放。
- 手机号去除首尾空白，校验 `+` 国家码和数字；不从示例推导特定国家号段或长度。验证码严格为 6 位 ASCII 数字。
- 校验发送响应的 `expiresAt / expiresInSeconds / resendAfterSeconds`。有效期取绝对截止时间与请求发起时间加有效秒数的较早者；重发截止时间从收到确认开始计算，保守处理网络耗时。每次计时按当前时间重新计算，回到前台立即更新。
- 更换手机号清除对应验证码、发送状态和计时；旧响应不会更新新手机号。登录、发送共用同步防重复保护；离页、修改输入、会话通知使旧操作失效。
- 匿名 `POST /api/v1/auth/sms/login`，body 为 `{ phone, code }`，`retry: 0`；复用 `toAuthSession` 和 `SessionManager.setSession`，成功导航 `Home`，不改权限或购物车。
- 错误映射以冻结文档为准：`SMS_CODE_INVALID`（含错误/失效）、`INVALID_CREDENTIALS`、`USER_DISABLED`、`RATE_LIMITED`/429、`SMS_UNAVAILABLE`、`VALIDATION_FAILED`。没有虚构独立的验证码过期错误码；本地已知过期时阻止提交。
- 网络异常和无法确认的响应不显示发送/登录成功，不自动重放，不记录手机号、验证码或 Token。

## core/auth.ts 调整与并发保证

本次按用户明确允许的例外修改了 `src/core/auth.ts`，仅处理退出和刷新竞态：

1. 保留正在刷新的原始会话 Promise，新增 `signOutForRevocation(expected)`。同步校验会话身份与待发布的会话变更，立即调用本地退出；随后等待该会话的刷新结果，撤销轮换后的 Refresh Token。
2. 继续使用已有 revision 拦截迟到刷新，旧退出的网络完成不再调用本地清理，因此不会清除后来的账号。
3. 记录本会话刷新结果未知的情况，包括刷新先失败、退出后发起的顺序。即使随后旧 Token 的退出请求成功，也返回 `unconfirmed`，不会把它描述成新 Token 或全部会话已撤销。
4. 本地存储清理失败不会报告已退出，并允许后续重试。没有新增会话持久化、Token 模型或购物车/缓存清理。

退出接口没有声明全局或 operation Bearer 鉴权，按匿名请求提交 `{ refreshToken }`，关闭重试，成功响应为 204。成功文案仅表示本次 Refresh Token 会话撤销已获确认，不声称其他设备、全部会话或已签发 Access Token 全部失效。

## 测试与实际修改文件

生产修改包括上表八个文件、`src/modules/auth/sms/SmsKeyboardLayout.tsx` 以及 `src/core/auth.ts`。键盘布局沿用注册页已有方式；注册页 helper 是 T12 私有函数，本任务未修改其导出，后续 T12 可统一提取。

新增独占测试：

- `__tests__/smsLogin.test.tsx`
- `__tests__/smsRepository.test.ts`
- `__tests__/smsScreen.test.tsx`
- `__tests__/logoutSession.test.ts`
- `__tests__/logoutButton.test.tsx`

测试支持：`src/modules/auth/sms/testing/fixtures.ts`（仅测试导入），`src/modules/auth/sms/testing/mockSmoke.ts`（手动显式执行）。交付说明为本文；临时 UI 验收入口、截图和构建产物位于忽略目录 `artifacts/`。

回归重点包括：发送成功/失败/限流/不可用、服务端计时、前台恢复、更换手机号、6 位校验、登录成功/错误/重复提交、离页和账号变化、退出确认取消、远端失败仍本地退出、会话刚开始写入但尚未发布的竞态、刷新完成/丢失响应/迟到、新账号登录、无 Refresh Token、本地清理失败重试。原有认证测试没有修改。

## Mockoon 3002 验证与限制

已只读确认本机 Mockoon `Mobile Mall Backend API` 的端口为 3002，`proxyMode: false`。使用固定虚构测试数据运行：

```text
npx tsx src/modules/auth/sms/testing/mockSmoke.ts --run-local-mock
```

实际结果：短信返回过去的有效期；短信登录返回空 Access/Refresh Token，被统一校验拒绝；退出返回 204、本地会话清空。没有向真实号码发送短信，没有进行真实账号成功登录或真实服务端 Token 撤销验证。

现有 Mockoon 默认响应从 Swagger 自动生成，尚不能验证成功链路。需由 mock 配置负责人修正：

- 发送成功响应的 `expiresAt` 使用当前时间加 `expiresInSeconds`，不能使用 `faker date.recent`。
- 登录成功响应提供稳定测试用户和非空测试 Token，保留 `tokenType: Bearer` 及正整数有效期；当前响应两类 Token 都为空。
- 错误响应使用对应接口的固定错误码，避免默认随机 `oneOf` 返回其他业务错误码。

客户端没有为迁就这些 mock 数据而弱化认证或有效期校验。修正 mock 后可重跑同一 smoke 脚本；脚本不输出凭据。

## 最终验证

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过，无警告 |
| `npm test -- --watch=false` | 31 套、368 项通过；含新增 57 项及原有邮箱登录、注册、刷新和个人资料回归 |
| `npm run bundle:android` | 通过 |
| `npm run bundle:ios` | 通过 |

初始依赖安装及 Metro/tsx 子进程在沙箱内遇到 ENOTCACHED / spawn EPERM；确认当前 worktree 没有占用进程后，使用原 lock 和原命令在获准的沙箱外完成。没有修改构建逻辑或绕过业务校验。

Android 真实渲染使用既有 `Expo_API_36` 模拟器与 debug 宿主，通过忽略目录下的独立 Metro 入口加载本任务的实际组件和确定性模拟 HTTP 响应。短信表单及退出确认框均检查 Aurora/Cedar、中英文和 375、768、1024、1280、1440、1920 逻辑宽度；Cedar 的中文仅为业务翻译压力测试，不改其生产 supportedLocales。宽屏保持 480 最大表单宽度，未观察到横向溢出、按钮截断或 Modal 超出屏幕。

已检查空表单/禁用、输入焦点、发送后倒计时、退出确认、退出进行中和远端失败反馈。发现并修正 375 宽度下的键盘遮挡，补入短信专属键盘布局，复查键盘展开时底部操作可滚动到达。截图及临时验收文件位于 `artifacts/t1-qa/`；截图中的 debug Metro 连接警告属于临时宿主，不是业务失败。

以上视觉链路使用模拟响应，不代表 Mockoon 当前默认成功响应已可用，也不代表真实短信验证。iOS 仅验证 JS Bundle，未执行 Xcode、iOS 模拟器或真机验收；未构建新的原生安装包。
