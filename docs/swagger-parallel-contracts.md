# Swagger 并行对接冻结契约（T0）

冻结日期：2026-09-08。本文是 T1–T12 的共同开发基线；未来接口定义是待实现的客户端边界，不表示 T0 已完成联调。与旧运行时代码冲突时，旧行为在对应业务任务接入前保持不变。

## 依据与基线交接

- 已读取 `AGENTS.md`、任务清单、`api-integration.md`、现有调用方与测试，以及本地 `artifacts/swagger-latest.json`。Swagger 标题 Mobile Mall Backend API，版本 1.0，83 个 HTTP 操作（21 个 admin 操作）。本次使用已有快照，没有向后端发起写请求。
- 快照 SHA-256：`23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`。版本号不能识别增量，所有任务必须核对该哈希；快照位于忽略目录，须随基线另外分发，不能在各任务中静默更新到不同 Swagger。
- 开始时已有未提交修改：`__tests__/App.test.tsx`、`assembleApplication.test.ts`，两品牌 `brand.config.json`、`docs/api-integration.md`、`ApplicationShell.tsx`、`auth/index.tsx`、`modules/contracts.tsx`；另有个人资料页面/repository/Hook/翻译及三个测试、新任务清单未跟踪。本次保留全部内容，只在已有 auth 入口上组合短信翻译。
- `global-rules/AGENTS_condition_rules.md` 缺失。T0 不创造状态规则，后续涉及状态流转的任务需补齐规则并核对 Swagger。
- **所有任务从同一份包含已有修改与 T0 的基线开始。未提交及未跟踪文件不会自动进入其他 worktree。** 本次不 commit/push、不创建后续任务。由用户授权提交基线，或显式复制完整工作区差异（包括新增文件）并核对；不要仅复制 `git diff` 而遗漏未跟踪文件。快照另行按上述哈希核对。

## 实际文件归属

下表路径以 `src/modules/` 为根；测试路径以仓库根为准。目录所有权包含未来在该目录创建的私有 DTO、页面、Hook、翻译与测试；“待建”不代表 T0 创建了占位实现。

| 任务 | 独占代码 | 独占测试 | 依赖 |
| --- | --- | --- | --- |
| T1 短信/退出 | `auth/sms/`；`auth/logout/`（待建） | 新增 `__tests__/sms*.test.ts(x)`、`logout*.test.ts(x)` | T0；公共会话变更交 T12 |
| T2 扫码 | `auth/qrLogin.ts`、`auth/QrLoginScreen.tsx`、`plugins/qr-login/`（此项以 src 为根） | 现有 `__tests__/qrLogin.test.ts`；新增 `qrAuthorization*.test.ts(x)` | T0 |
| T3 商品 | `commerce/catalog/`、`commerce/catalog.ts`、`commerce/useProducts.ts` | 现有 `__tests__/commerceProducts.test.tsx`；新增 `catalog*.test.ts(x)` | T0；调用 T4 加购 |
| T4 购物车 | `commerce/cart/`、`commerce/CartStore.ts` | 现有 `__tests__/commerceCart.test.ts`；新增 `cart*.test.ts(x)` | T0 |
| T5 优惠券 | `commerce/coupons/`（待建） | 新增 `__tests__/coupons*.test.ts(x)` | T0 |
| T6 结算 | `commerce/checkout/`（含未来 ShippingAddress 类型/表单） | 新增 `__tests__/checkout*.test.ts(x)` | T4 快照、T5 选券；输出给 T7 |
| T7 支付 | `commerce/payments/`、`commerce/payment.ts` | 现有 `__tests__/commercePayment.test.ts`；新增 `payments*.test.ts(x)` | T6/T8 的 orderId |
| T8 订单 | `commerce/orders/`（待建） | 新增 `__tests__/orders*.test.ts(x)` | T7/T9 导航契约 |
| T9 售后 | `commerce/after-sales/`（待建） | 新增 `__tests__/afterSales*.test.ts(x)` | T8 权威订单读取 |
| T10 会员/消息 | `commerce/account/`、`commerce/notifications/`（待建） | 新增 `__tests__/account*.test.ts(x)`、`notifications*.test.ts(x)` | T0 |
| T11 秒杀 | `commerce/seckill/`（待建） | 新增 `__tests__/seckill*.test.ts(x)` | T6 收货表单 |
| T12 公共集成 | 见下文 | 所有未明确分配的既有总测试 | 分批集成 T1–T11 |

T12 独占：`auth/index.tsx`、`auth/AuthMethodScreens.tsx`、`auth/repository.ts`、`auth/authResponse.ts`、`auth/shared/`、全部现有个人资料文件，`commerce/index.tsx`、`commerce/screens.tsx`、`commerce/repository.ts`、`commerce/types.ts`、`commerce/shared/`、`src/core/`、`src/app/`、`src/modules/contracts.tsx`、`src/brand/`、`brands/`、公共配置与本文/任务清单/`docs/api-integration.md`。未分配文件不能由业务任务顺手修改。生成文件仍只由既有生成脚本更新。

特别冻结总测试：`App.test.tsx`、`assembleApplication.test.ts`、`commerceScreens.test.tsx`、`commerceRepository.test.ts`、`translations.test.ts`、`authLogin.test.tsx`、`authRegister.test.tsx`、`authRegisterRepository.test.ts`、`authSession.test.ts`、`http.test.ts` 及个人资料三个测试均归 T12。业务新增测试放自己的前缀或目录，不抢改这些文件；T12 负责最终兼容层和装配回归。业务内部读取其他目录的公开 API 不构成写入权限。

现有扫码翻译由插件自身所有者 T2 管理；短信 `auth.login.phone.*`、`auth.login.code.*` 已移到 `auth/sms/translations.ts`；商品 `commerce.products.*`、`commerce.detail.*`、`commerce.demo.*`，购物车 `commerce.cart.*`，结算 `commerce.checkout.*`，支付 `commerce.payment.*` 分别归各业务 `translations.ts`。路由标题、通用重试和共享商品图片文案由入口/T12 保持，新增路由标题由业务提交清单给 T12 装配。

## T0 已有导出与兼容层

- `commerce/screens.tsx` 保留 `createCommerceScreens(repository, cart, paymentLauncher)`，组合 `catalog/screens.tsx::createCatalogScreens`、`cart/screen.tsx::createCartScreen`、`checkout/screen.tsx::createCheckoutScreen`。页面组件在工厂中创建一次，不在 render 中重建。
- `CommerceRepository` 五个公开方法与默认参数保留。实现分别在 `catalog/repository.ts`（`listProducts(http, page?, pageSize?)`、`getProduct(http, id)`）、`checkout/repository.ts`（`createOrder(http, lines)`）、`payments/repository.ts`（`createPayment(http, orderId, provider)`、`getPaymentStatus(http, paymentId)`）。兼容方法仅负责委托，业务任务从自己目录导出未来接口，T12 再调整装配，不要求兼容旧 DTO 的同时强行塞入新 DTO。
- `commerce/types.ts` 保留原类型名的 type re-export；Product/ProductPage 在 catalog，CartLine 在 cart，旧 Order 在 checkout，旧 PaymentProvider/Session/Status 在 payments。旧小写支付状态、productId 下单和 body 幂等键不是新版协议。
- `payments/useCheckoutPayment.ts::createUseCheckoutPayment` 保存旧收银台支付编排、AppState 查询和状态转换；T6 不编辑该文件。T6 新结算通过下面的 orderId 边界交付 T7，T12 最终替换旧工厂连接。现有按支付成功清空购物车的行为不在 T0 修改。
- `commerce/shared/ui.tsx` 只包含实际多处使用的 ProductImage、PrimaryButton、EmptyState；QuantityButton 留在 cart，SummaryRow 留在 checkout。各页面样式原值就地归属，未引入公共大样式表。`shared/idempotency.ts` 是两个旧请求确实共用的生成函数，生成格式不变，尚未实现未来操作级持久化。
- `auth/AuthMethodScreens.tsx` 保留 PhoneLoginScreen re-export，实体在 `auth/sms/PhoneLoginScreen.tsx`；其余认证页面保持原路径。共用表单控件及主题样式在 `auth/shared/form.tsx`。
- `auth/authResponse.ts` 导出 `AuthenticationResponse` 和 `toAuthSession(response): AuthSession`；这是已有登录/注册校验的原样提取，继续调用 `applyAuthTokens`，校验 user.id、Bearer 类型、非空 Token、正安全整数有效期，不自行授予权限。T1 直接复用，不复制校验。

## 未来跨业务 TypeScript 边界

以下定义暂存文档，**不是现有 CartStore/CommerceRepository 的 API**。无调用方时不落地 SDK。接口由标注的业务目录实现/导出；T12 只负责装配、公共修订。全部 Promise 失败时 reject，不能用空列表、零金额或假成功吞掉错误。标识目前用 string 表达以匹配现有导航，运行时由拥有者校验，不能互换含义。

未来公开定义落点：T4 `cart/contracts.ts` 导出 SkuSelection/CartOwner/SelectedCartItem/CheckoutSnapshot/CartCheckoutPort；T5 `coupons/contracts.ts` 导出选券类型，`coupons/CouponSelector.tsx` 导出组件；T6 `checkout/contracts.ts` 导出 CheckoutInput/PricingInput/PricingSummary/CheckoutPort；T7 `payments/contracts.ts` 导出支付边界；T8 `orders/contracts.ts` 导出权威售后投影与 OrdersPort；T9 `after-sales/contracts.ts` 导出申请边界。业务实现自行绑定现有 services.http，由 T12 注入这些 port。依赖方在拥有者交付前用测试替身，不提前创建这些生产文件；T3/T6 直接 import T4 的 SkuSelection，不另复制定义。旧导出签名在 T12 切换调用方前保持，新协议使用新增导出，避免并行修改导致公共兼容层无法编译。

```ts
// T4 导出：商品 T3 只提交真正选择出的 SKU，不能用 productId 代替。
type SkuSelection = Readonly<{ skuId: string; quantity: number }>;
type CartOwner = Readonly<{ userId: string | null; generation: number }>;
type SelectedCartItem = SkuSelection & Readonly<{
  productId: string;
  cartItemId: string | null; // 服务端条目 id；访客项为 null，不能伪造 UUID
}>;
type CheckoutSnapshot = Readonly<{
  snapshotId: string;
  owner: CartOwner;
  items: readonly SelectedCartItem[];
}>;
interface CartCheckoutPort { // T4 实现并导出，T3/T6 消费
  addItem(skuId: string, quantity: number): Promise<void>;
  refresh(): Promise<void>;
  captureCheckout(): Promise<CheckoutSnapshot>;
  getCheckoutSnapshot(snapshotId: string): CheckoutSnapshot | undefined;
  reconcileOrder(input: {
    orderId: string;
    snapshotId: string;
  }): Promise<void>;
}
```

`addItem` 的 quantity 为本次增量，1–99 整数。`cartItemId` 用于服务端 PATCH/DELETE，`skuId` 用于加购/试算/下单，`productId` 用于商品详情。captureCheckout 先刷新登录购物车，再复制有效且选中的 SKU，数量不足/失效项不得混入快照；T4 必须保证同一 snapshotId 内容不可变，不能只做浅拷贝。用户变化时 generation 更新，即使退出后重新登录相同 userId 也不可复用旧快照。captureCheckout 失败不能导航到空的结算。

T6 经 `snapshotId` 取得快照并核对当前 owner；刷新页面、快照丢失、账号变化时返回购物车重新确认，不从 URL 接受任意金额/地址 JSON。T6 对同一快照使用同一 items 做试算和下单；去除 productId/cartItemId 后发出请求。未来 reconcileOrder 在已知下单成功后调用，不代表支付成功：T4 负责核对服务端实际清理行为并刷新，只处理已购快照项，保留未购买项和后续新增数量；结果未知不盲删，不把整个购物车清空。该核对策略由 T4 实现，T0 保留旧行为。

```ts
// T5 导出：couponId 是 UserCouponResponseDto.id，不是 couponTemplateId。
type CouponChoice = Readonly<{ couponId: string }> | null;
interface CouponSelectionProps {
  value: CouponChoice;
  disabled?: boolean;
  onChange(value: CouponChoice): void;
}
// T5 导出 CouponSelector(props: CouponSelectionProps): React.JSX.Element。
// 可用列表只代表账号券可用，是否适用于本订单仍以 T6 试算为准。

// T6 导出：ShippingAddressDto 的全部字段，无地址簿 ID/坐标等扩展。
interface ShippingAddress {
  recipient: string;
  phone: string;
  province: string;
  city: string;
  district?: string;
  addressLine: string;
  postalCode?: string;
}
type ShippingAddressDraft = Partial<ShippingAddress>;
type ShippingAddressValidation =
  | { valid: true; value: ShippingAddress }
  | { valid: false; errors: Partial<Record<keyof ShippingAddress, string>> };
interface ShippingAddressFormProps {
  value: ShippingAddressDraft;
  errors?: Partial<Record<keyof ShippingAddress, string>>;
  disabled?: boolean;
  onChange(value: ShippingAddressDraft): void;
}
// T6 在 checkout/ShippingAddressForm.tsx 导出表单；checkout/shippingAddress.ts
// 导出上述类型与 validateShippingAddress(draft): ShippingAddressValidation。
// T11 只 import，不另建地址模型。表单不请求 API，提交由各业务页面负责。

type CheckoutInput = Readonly<{
  items: readonly SkuSelection[];
  couponId?: string;
  shippingAddress: ShippingAddress;
}>;
type PricingInput = Pick<CheckoutInput, 'items' | 'couponId'>;
type PricingSummary = Readonly<{
  originalAmount: string;
  promotionDiscountAmount: string;
  couponDiscountAmount: string;
  shippingAmount: string;
  shippingDiscountAmount: string;
  discountAmount: string;
  payableAmount: string;
}>;
interface CheckoutPort { // T6；私有完整响应 DTO 不提升到 shared
  preview(input: PricingInput): Promise<PricingSummary>;
  create(input: CheckoutInput, operation: {
    idempotencyKey: string;
  }): Promise<{ orderId: string }>;
}

// T7 导出，接收 T6 或 T8 的 orderId；不能接收客户端应付金额。
type PaymentEntry = Readonly<{ orderId: string }>;
type NewPaymentProvider = 'MOCK' | 'WECHAT_PAY' | 'ALIPAY';
type PaymentResult = Readonly<{
  paymentId: string;
  orderId: string;
  status: string; // Swagger 是 string，未知值作为未确认展示，不转为成功
  amount: string;
  currency: string;
}>;
interface PaymentsPort {
  create(input: PaymentEntry & { provider?: NewPaymentProvider }, operation: {
    idempotencyKey: string;
  }): Promise<PaymentResult>;
  get(paymentId: string): Promise<PaymentResult>;
}

// T8 导出供 T9 读取的最小权威投影；不是客户端自行计算的退款额度。
type OrderForAfterSale = Readonly<{
  orderId: string;
  status: string;
  items: readonly Readonly<{
    orderItemId: string;
    productId: string;
    skuId: string;
    quantity: number;
  }>[];
}>;
interface OrdersPort {
  getForAfterSale(orderId: string): Promise<OrderForAfterSale>;
}
type AfterSaleEntry = Readonly<{
  orderId: string;
  orderItemId: string;
  quantity: number; // 初始意图，目标页须重新校验，不是服务端授权
}>;
// T9 提交自己的 DTO；refund 与 after-sale 的枚举绝不能混用。
type RefundInput = {
  orderId: string;
  type?: 'REFUND_ONLY' | 'RETURN_AND_REFUND';
  items: { orderItemId: string; quantity: number }[];
  reason: string;
};
type AfterSaleInput = {
  orderId: string;
  type: 'REFUND_ONLY' | 'RETURN_REFUND';
  items: { orderItemId: string; quantity: number }[];
  reason: string;
  description?: string;
};
interface AfterSalesPort { // T9 导出；同一次申请只能选其中一条流程
  requestRefund(input: RefundInput, operation: {
    idempotencyKey: string;
  }): Promise<{ refundId: string; status: string }>;
  requestAfterSale(input: AfterSaleInput): Promise<{
    afterSaleId: string; status: string;
  }>;
}
```

ShippingAddress 必填 recipient/phone/province/city/addressLine；最大长度分别 100/32/100/100/300；district/postalCode 可选，最大 100/20。表单输出去除首尾空白，可选空值省略，必填空值报错；这是客户端表单约定，不声称 Swagger 声明了 minLength。phone 的国家码示例不是该 DTO 的正则规则，不从示例推导额外限制。错误值为可显示的本地化字段提示。表单输入可不完整，验证通过的输出才可提交；不添加地址簿、默认地址、经纬度或国家字段。

Swagger CreateOrderDto 仅 shippingAddress 必填、items 可省略；客户端有意固定 **显式 items**，1–50 项、quantity 1–99 整数，避免取服务端当时已变化的选中项。pricing/preview 只发送 items/couponId，响应未提供 currency 字段，不自行加地址或虚构币种。下单响应 `data.id` 映射为 orderId；支付 `data.payment.id` 映射为 paymentId。T9 先通过 T8 获取订单权威项，重新校验关联与数量；不能传 Product/订单缓存对象直接申请。服务端仍负责最终退款金额与资格校验。

## 金额、HTTP、会话与幂等

- 当前 Product.priceMinor、Order.amountMinor 和购物车 totalMinor 是整数分，现有 `formatMoney` 按除以 100 展示。旧商品 basePrice 转换原样保留在 catalog/repository.ts：十进制字符串取两位并按第三位四舍五入，拒绝非法/超安全整数，1.005 得到 101。这是既有两位主币单位假设，不能扩大为所有新版接口的事实。
- 新版金额 DTO 保留原始 Decimal 字符串，避免 `parseFloat(value) * 100`。只有字段主/辅币单位、currency 和小数位已核实才转换展示；精度和舍入只能用于展示，不能用客户端重算金额下单。搜索 salePrice 是 number、试算缺 currency；不能仅因字段名 price 就乘/除 100。未知单位标记金额不可确认，阻止依赖该金额的确认操作，记录字段与接口待后端确认；不得默认 CNY、当零元或复用旧转换。未来多业务确需相同转换时，由 T12 提取并覆盖非法输入、舍入与溢出测试；T0 不创建无人使用的新金额 helper。
- 共用 `services.http`。HttpClient 接收 `headers`（基于 RequestInit）、默认 JSON Content-Type/Accept、自建 X-Request-Id、默认鉴权；匿名请求显式 `authenticated: false`。自定义 `Idempotency-Key` 可直接传入，无需新客户端。URL 保持 `/api/v1/...`，路径 ID 用 encodeURIComponent。
- 新 Swagger 成功响应由 repository 解 `data` 一次；请求 body 直接发送 DTO，**不包 `{data: ...}`**。HttpClient 不全局拆 data；旧 `/v1/commerce/*` 非包装响应在 T0 保留。错误复用 ApiError.status/code/message/requestId 与 AuthenticationRequiredError；当前 ApiError 从响应头读取 requestId，不保存 details 或 body requestId。若后续确需字段错误详情，提交给 T12，禁止业务另写 fetch 层或静默改 core。
- 默认 `retry` 是 1（共两次网络尝试），包括 POST 网络错误/5xx；有副作用的业务请求统一显式 `retry: 0`。这**不关闭**现有一次 401 刷新后的同请求重发：该路径沿用同一 body/headers/幂等键，前提是 401 没有产生业务副作用。若后端不能保证该前提，由 T12 协调，T0 不改变刷新机制。GET 可以沿用现有重试。
- SessionManager 已包含过期续期、并发刷新共享、revision 检查和拒绝旧 Token 清理新账号；刷新网络失败保留会话，明确失效才清除。登录/注册原有离页保护与 session.setSession 保持；短信 T1 复用 authResponse 后在页面仍有效且账号意图未变化时才写会话。无持久登录能力的新增假设。
- 新下单/领券/退款的幂等键在 `headers: {'Idempotency-Key': key}`，不放 DTO。支付请求头可选，客户端约定仍携带。下单/支付格式 `[A-Za-z0-9._-]{8,128}`；重复大小写 Swagger 参数是同一个 HTTP 头，不发两份。生成在用户确认新操作时，同操作同请求体的超时重试复用；改变 items/coupon/address/provider 等意图须新操作、新键。幂等冲突/处理中不能换键强行再下单；业务所有者保存操作状态及不确定结果，T12 不替业务自动重放。
- 累加加购、无幂等契约的售后、秒杀和积分副作用不因网络未知自动重放。幂等键不是万能防重，未声明的接口不能靠自行加头假设服务端去重。支付前台返回、订单 PAID、支付 SUCCESS 等必须按各自服务端响应理解，不能复用旧小写枚举推断新版状态。
- 各业务 Hook/repository 管理请求代次、mounted 状态和当前账号所有权；离页/切账号迟到响应不得更新页面、购物车、通知数或发导航。HttpClient 内部 signal 是超时 controller，不能假设传入 signal 会取消请求，业务仍需代次保护。SessionManager 只保护会话，不自动保护业务缓存。
- 认证数据默认不使用共享 cache；必须缓存时 key 包含 userId 和账号生命周期代次，退出/切换清理，旧响应不能重新写新账号缓存。HttpClient 在鉴权前读缓存，不能使用全局 `cart`/`orders` key。T4 对购物车/快照负责，T5 对券、T6 对地址/试算/操作、T7 对支付查询、T8/T9 对订单售后、T10 对余额/消息、T11 对 token/排队结果负责。T1 提供退出组件，T12 接入所有者清理连接；不得记录 Token、scanToken 或收货隐私。

## 访客购物车（T4 待实现）

T0 保留现有内存 productId 购物车、登录后保留购物车及旧支付成功 clear 行为，不迁移数据。未来 T4 方案是：真实 SKU + 本地访客购物车 + 登录后显式确认合并。旧商品项没有 skuId 时不能把 productId 填进去，须提示重新选择规格；未确认不上传，也不能静默丢失访客内容。

T4 保存每个来源 SKU 的待合并/发送中/已确认/结果未知/失败进度并隔离目标账号。合并前读取服务器购物车，用户确认后串行提交增量；成功项不可再次提交。超时或断网可能已累计，先刷新核对；并发设备修改导致无法证明归属时展示结果未知并要求用户确认下一步，不能凭数量相等就声称精确一次。失败恢复由 T4 负责，不全量重放、不自动清空来源、不把 A 用户进度续到 B 用户。持久化能力及服务端合并操作标识尚无契约，不能保证跨重启精确一次；需要明确产品确认或后端支持后扩大范围。

## 路由与装配

沿用 `useAppNavigation()` 和 `useRouteParams()`，RouteParams 是 `Readonly<Record<string, string>>`，不新增导航库。路由参数只传下面的字符串标识；T12 在原 auth/commerce 模块注册，业务任务交付组件和所需依赖即可。所有新名称是预留契约，T0 未注册新页面。

| 页面/负责人 | routeName | params | 要求 |
| --- | --- | --- | --- |
| 短信 T1 | `PhoneLogin`（已有） | 无 | 匿名 |
| 扫码 T2 | 保持插件现有路由 `QrLogin` | 无 | 复用扫描入口，需登录 |
| 商品 T3 | `CommerceProducts` / `CommerceProductDetail`（已有） | 无 / `{productId: string}` | 商品查询不冒充 SKU |
| 购物车 T4 | `CommerceCart`（已有） | 无 | 访客可访问 |
| 结算 T6 | `CommerceCheckout`（已有） | 未来 `{snapshotId: string}` | 需登录；T0 仍无参旧行为 |
| 优惠券 T5 | `CommerceCoupons` | 无 | 需登录；选择组件用 props |
| 支付 T7 | `CommercePayment` | `{orderId: string}` | 需登录；读取权威支付数据 |
| 订单 T8 | `CommerceOrders` / `CommerceOrderDetail` | 无 / `{orderId: string}` | 需登录 |
| 售后 T9 | `CommerceAfterSale` | `{orderId: string, orderItemId: string, quantity: string}` | 正整数解析/权威重读 |
| 会员/消息 T10 | `CommerceAccount` / `CommerceNotifications` | 无 | 需登录 |
| 秒杀 T11 | `CommerceSeckill` / `CommerceSeckillDetail` | 无 / `{activityId: string}` | token/提交需登录 |

T6→T7 仅 navigate('CommercePayment', {orderId})；T8→T9 把数量转十进制字符串，其余参数不可携带订单对象/金额/地址。T11 表单提交收到 `{status: 'QUEUED', requestId: string}` 只展示排队，不导航虚构订单；没有结果查询接口，不能通过订单列表猜测归属。

集成顺序：T1/T2/T10 可独立接入；T3+T4 → T5+T6 → T7+T8 → T9；T11 浏览/提交复用 T6 表单。并行期间按本文输入/输出提供所属测试的 mock，不创建第二套生产实现。跨目录签名变更交 T12 修订本文并通知消费者后统一装配，不能两任务同时写兼容入口。

## 尚待补充与验收范围

- 新金额字段的单位/币种/舍入依据（尤其搜索 number 和试算无 currency）、运费与地址关系；购物车显式 items 下单后的服务端清理细则；跨重启合并恢复和精确一次支持。
- 真实支付拉起参数：当前 paymentParameters 只声明 provider/paymentNo/expiresAt/mockSuccessPath，不包含微信/支付宝 SDK 或 redirectUrl；MOCK 成功只限开发验证，不能用支付 callback 代替客户端 API。
- 秒杀 requestId 结果与 orderId 关联、用户退款/售后列表/详情/撤销、地址簿、可领券模板目录、积分兑换目录、物流轨迹、找回密码和资料编辑仍无完整移动端闭环契约。
- 既有旧收银台没有全面离页/账号响应保护、使用旧下单/支付协议并成功后清空购物车；这是 T6/T7/T4 后续替换边界，不在本次夹带修复。core 默认重试、缓存读取时序及错误 details 限制见上文，T0 不改 core。
- T0 仅源码提取，页面 JSX、交互属性和样式值保持；保留 26 套/311 项现有测试，无测试入口改动，无新增非平凡逻辑，无生产依赖或 lock 变更。检查执行结果在任务交付中记录；JS Bundle 不等于原生安装、真机/iOS 验收或真实支付联调。

### T0 实际检查结果

| 检查 | 提取前 | 提取后 |
| --- | --- | --- |
| npm run typecheck | 通过 | 通过 |
| npm run lint | 通过 | 通过 |
| npm test -- --watch=false | 26 套 / 311 项通过 | 26 套 / 311 项通过 |
| npm run bundle:android | 沙箱内 Metro 初始化失败，Bundler.end 读取 undefined.end | 原命令在沙箱外通过 |
| npm run bundle:ios | 同上 | 原命令在沙箱外通过 |

日志保存在忽略目录 `artifacts/t0-before-*.log`、`artifacts/t0-after-*.log`（typecheck/lint 提取后为命令直接输出）。额外核对提取前后全部 JSX 语法树及样式属性：商城 88 处样式引用定义、认证 25 处样式定义一致；商城两语言全部翻译键值一致，`git diff --check` 通过。未触及页面结构、样式值或业务功能，因此本次未启动原生 App 做视觉重验；未进行 Android 原生包、iOS Xcode/真机、短信发送、真实购物车下单或支付联调。原始 Bundle 失败发生在改动前，未通过修改构建逻辑规避；提取中临时 `.tsx` 核对副本曾被 typecheck 扫入，已改为忽略目录下 `.txt` 后通过，无生产代码类型失败遗留。


## T12 第一批交接（2026-09-12）

当前工作区已具备 T1/T2 新协议代码；T3–T11 尚未交付。T12 本批接入退出操作区和中英文翻译，保留已有短信及扫码路由、品牌开关和权限过滤。ProfileSessionActions 由 ApplicationShell 在资料导航下持续挂载，让本地退出后的服务端撤销结果可见；不保留已撤销权限的资料内容。

App 总测试增加取消退出、匿名 refreshToken 撤销请求、移除个人资料、503 不自动重放及失败结果可见的整链路断言。该测试使用模拟 HTTP，不代表真实服务联调。

后续必须交付 T3–T11 所属页面、translations 与公开 port，补齐冻结 Swagger 快照及状态规则文件，再按既定依赖顺序装配商城。T12 保持部分完成状态，不能标记最终验收通过。


## T12 第二批：T3＋T4 集成（2026-09-12）

- 接收任务“实现 T3 Swagger 并行任务”的 `6aaac18` 和“实现 T4 Swagger 任务”的 `00ee447`，两者均基于 `1062043`。仅导入对应业务目录与测试差异，未合入无关分支或创建提交。
- commerce 模块装配真实 CatalogRepository、SkuCartStore 与新页面；工厂在装配时创建一次，initialize 刷新购物车并监听账号变化，dispose 释放监听。详情只调用 addItem(skuId, quantity)，购物车徽标使用同一新 store，不再读取旧 productId 数量。
- 商品详情提供购物车入口，访客购物车提供登录入口；登录不自动重放访客加购，需在购物车显式确认合并。
- 保留原四个路由名与权限/品牌开关。Cedar 原配置不包含 commerce，仍不开放商城；其主题兼容预览不代表新增品牌功能。
- T6 尚未交付：CommerceCheckout 显示本地“结算暂不可用”，可返回购物车；不会调用旧 /v1/commerce/orders 或旧支付接口。快照仍由 T4 捕获并持有，后续 T6 通过 snapshotId/owner 契约接入。不创建临时订单模型或假下单。
- 旧 createCommerceScreens/repository/types 兼容导出保持，正式模块不再使用旧整车清空支付链路。T5–T11 与真实支付闭环仍待交付。
- 已读取全局状态规则 `C:/Users/30728/.codex/global-rules/AGENTS_condition_rules.md`；核对主工作区冻结 Swagger 哈希为 `23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`，无契约漂移。
