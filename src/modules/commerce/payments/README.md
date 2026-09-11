# T7 支付交付

基线 `04ba07508ee969ba6c6f746582b798c1f1624cf9`，包含 T12 第二批 T3/T4 集成。冻结 Swagger 已复制到忽略目录 `artifacts/swagger-latest.json`，SHA-256：`23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`。

## T12 装配

```ts
import { PaymentsRepository } from './payments/api';
import { PaymentController } from './payments/PaymentController';
import { createPaymentScreen } from './payments/screen';

const payments = new PaymentsRepository(services.http);
const paymentController = new PaymentController(payments, services.session);
const PaymentScreen = createPaymentScreen(paymentController);
// 在模块现有 dispose 中调用 paymentController.dispose()。
```

以上对象和工厂在模块装配时各创建一次，不在 render 中重建。页面 effect 管理进入/离开和 AppState 监听。一个 controller 对应一个活跃支付页面；同账号各订单操作记录保留至退出、切换账号或 dispose。

- 路由：`CommercePayment`，参数仅 `{ orderId: string }`，`requiresAuth: true`，沿用 commerce 品牌/权限限制。
- 路由标题键：`commerce.payment.v2.title`；不新增菜单入口。
- 页面返回 `CommerceOrders`；该路由由 T8/T12 装配。
- T6/T8 仅 `navigate('CommercePayment', { orderId })`，不传金额、订单对象或地址。
- `paymentsTranslations` 保留旧键并合并 `flowTranslations.ts` 中完整的中英文 `commerce.payment.v2.*`；T12 继续注册现有 translations 即可，不复制翻译。
- 未导入其他并行任务的文件；只依赖现有 HttpClient、SessionManager、导航、主题和 PrimaryButton。无需 T6/T8 生产实现即可测试支付边界。

## 公开 API

- `contracts.ts` 原样落实冻结 `PaymentEntry`、`NewPaymentProvider`、`PaymentResult`、`PaymentsPort`。
- `api.ts::PaymentsRepository` 实现 `PaymentsPort`；`create(input, {idempotencyKey})` 返回 `PaymentDetails`，`get(paymentId)` 返回同一投影。扩展字段为 userId、paymentNo、provider、expiredAt；跨业务只需依赖最小 `PaymentResult`。
- `PaymentController` 提供 subscribe/getSnapshot、enter（返回离页清理函数）、create、check、dispose。第三个构造参数仅用于测试注入 key 工厂。
- `screen.tsx::createPaymentScreen(controller)` 返回无 props 的路由页面。
- 旧 `repository.ts`、`types.ts`、`useCheckoutPayment.ts`、`commerce/payment.ts` 未改，兼容签名和旧测试保留。T12 应接入新增 API；旧兼容入口仍含旧协议，不能作为新版支付链路使用。

## 请求与状态约束

- POST `/api/v1/orders/{orderId}/payments`，body 只含 provider；GET `/api/v1/payments/{id}`。路径 ID 编码，响应只拆一次 data。无 `/pay` 重复接入，无 App 调用渠道 callback。
- 所有副作用显式 `retry: 0`；幂等键只在 `Idempotency-Key` 请求头。HttpClient 既有 401 刷新机制保留，同次重发沿用 body/header。
- UI 显式发送配置渠道 WECHAT_PAY/ALIPAY，不使用服务端默认 MOCK。读取支付单是显式操作，不自动向支付渠道扣款，也不自动创建业务订单。
- 同订单创建并发去重。创建后查询只用返回的 paymentId；未知创建结果只能显式重试同一 body/key，切换渠道也不会覆盖已冻结意图。400/401/403/404/409 进入阻塞态，不换键绕过冲突。
- 离页后丢弃旧请求结果，重入保留原操作键；已知支付单重入会重新查询。App 从非 active 回到 active 时查询，重复 active 事件不重复发请求；手动查询共用并发锁。不轮询、不自动重放创建。
- 退出/切账号清空操作记录，即便退出后登录相同 userId，旧请求也失效。同 userId 的 token 刷新保留操作。返回订单 ID、支付 ID 和响应 userId 不匹配时拒绝写入状态。
- SUCCESS 单独表示支付状态成功，不自动标记业务订单 PAID、不清空购物车、不发成功导航。PENDING/PROCESSING、FAILED、EXPIRED 分别展示；其他状态（包括旧 succeeded 和订单 PAID）均未确认。查询失败时不把旧 SUCCESS 当作当前确认结果展示。
- 金额原始 Decimal 字符串保留，不 parseFloat、不乘除 100、不默认币种；单位未经确认，UI 不展示应付金额或提供付款确认。没有通过 expiredAt 本地计时推断服务端终态。
- 操作记录仅为当前运行期内存，不包含账号 Token，也不持久化收货信息；跨 App 重启恢复及跨设备精确一次不在现有客户端契约中保证。

## 开发支付

`testing/developmentPayment.ts::completeDevelopmentPayment(http, paymentDetails, {environment, confirmed})` 是单独的手动开发联调函数，不被生产页面/工厂导入。必须 `environment: 'development'`、`confirmed: true` 且返回渠道为 MOCK。staging/production 和其他渠道均在请求前拒绝。

开发环境显式按以下顺序执行：

1. `payments.create({orderId: 已确认的开发订单, provider: 'MOCK'}, {idempotencyKey: 同操作固定键})`。
2. 用户确认后调用 `completeDevelopmentPayment`。
3. `payments.get(created.paymentId)` 查询权威支付状态，再从订单页核实业务订单。

模拟成功用已返回的 paymentNo 构造固定 `/api/v1/mock-payments/{paymentNo}/success`，不执行任意 mockSuccessPath，不调用 `/payments/callback/{provider}`。该接口按 Swagger 匿名调用且不自动重试；返回 outcome 原样区分 PAID、ALREADY_PROCESSED、COMPENSATION_REQUIRED，补偿中不等于订单成功。

## 验证与限制

- 新增所属测试：`__tests__/paymentsRepository.test.ts`、`paymentsController.test.ts`、`paymentsScreen.test.tsx`；原 `commercePayment.test.ts` 不变。
- `npm ci --ignore-scripts` 后 `npm ls --depth=0` 完整；安装前查询当前 worktree 相关进程，未发现占用。无项目生产依赖或 lock 变更。预览工具另装在忽略目录。
- typecheck、lint、git diff --check 通过；支付相关 4 套 39 项通过，全量回归 47 套 548 项通过。
- 原 `npm run bundle:android` / `bundle:ios` 通过；另用忽略目录入口直接 import T7 页面/控制器/API，Android/iOS Metro Bundle 均通过，防止未装配页面未进入原应用 Bundle。沙箱初次 spawn EPERM 后原命令在沙箱外成功，未弱化配置。
- 真实 React Native Web 浏览器预览直接渲染当前组件，仅替换 ApplicationProvider 和网络 port 为隔离测试环境。两品牌主题、中英文、375/768/1024/1280/1440/1920 宽度，覆盖创建、渠道选择、等待、手查成功；375 宽度额外覆盖加载、网络失败、过期、失败、未知状态和订单过期。截图及结果在 `artifacts/payment-preview/`。Cedar 仅为主题兼容预览，不扩大其品牌商城权限。
- 48 个场景检查无横向溢出或浏览器运行时错误；最终另检查 4 个窄屏品牌/语言组合的键盘空格选中、Focus、加载按钮禁用和文本裁切。已修正长加载文案，并使用带选中状态的渠道按钮；浏览器适配层不等同于原生读屏实现。
- 未连接 Android 设备；未做原生安装、真机/iOS Xcode 验收。没有提供真实后端测试账号与开发订单，本次 HTTP 测试替身及浏览器预览不代表真实支付联调。
- 真实微信/支付宝拉起参数缺失（只有 provider/paymentNo/expiresAt/mockSuccessPath），金额单位待后端确认，T12 路由装配待接入。本任务未制作假支付链接、未接 SDK、未清理购物车、未改公共文档/装配、未 commit/push。
