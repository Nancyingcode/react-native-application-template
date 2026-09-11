# T6 结算交付

基线 `04ba07508ee969ba6c6f746582b798c1f1624cf9`，包含 T12 第二批 T3/T4 集成。冻结 Swagger SHA256：`23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`。

## 已实现与契约阻塞

- 单次订单收货表单：七个冻结字段、首尾空白规范化、必填/最大长度校验、双语提示、输入焦点和禁用状态；不提供地址簿或推测电话正则。
- `CheckoutRepository` 使用共用 HttpClient 请求 `/api/v1/pricing/preview` 和 `/api/v1/orders`，请求直接发送 DTO，响应解一次 data。显式 SKU items、数量和用户券 UUID 校验；不发送 productId/cartItemId/地址到试算，不发送价格到下单。
- Decimal 原文展示；冻结试算接口缺少币种、单位和地址运费规则。因此页面固定禁用创建订单，未加入金额确认 override 或虚构 CNY。真实下单、支付导航的页面闭环须后端补充契约后继续完成，不能把此交付标记为生产交易验收通过。
- 下单底层操作已实现：`retry: 0`、请求头幂等键、同意图并发合并/手动重试、未知结果与冲突保护、账号生命周期隔离、真实 orderId 保存、仅交 T4 reconcileOrder 而非清空整车、受账号/页面有效性保护的 T7 路由交接。
- 新结算页只使用冻结快照；失效、刷新丢失或账号变化显示返回购物车。换券使旧试算失效，离页/换账号后迟到响应不能恢复页面数据。

## T12 装配

1. `new CheckoutRepository(services.http)`，导出类位于 `checkout/api.ts`，实现 `checkout/contracts.ts::CheckoutPort`。
2. `createSkuCheckoutScreen(repository, skuCartStore, CouponSelector)`，位于 `checkout/CheckoutScreen.tsx`。工厂只创建一次，注入 T4 的同一个 `SkuCartStore`、T5 的已绑定账号依赖的 `CouponSelector`；页面参数只读 `snapshotId`。
3. 用新页面替换现有 `CommerceCheckout` 的临时不可用页面；保持已有需登录和品牌/权限过滤。参数 `{ snapshotId: string }`；失败返回 `CommerceCart`。T6 没有更改公共装配文件。
4. 合并 `checkout/translations.ts::checkoutTranslations` 的两套语言；所有键均在 `commerce.checkout.*`（地址、试算明细、错误、快照失效和金额不可确认等）。页面标题仍用现有 `commerce.checkout.title`，不新增菜单。
5. `shippingAddress.ts` 导出全部冻结地址类型与 `validateShippingAddress(draft, translate?)`；单参数默认返回可显示中文字段提示。`ShippingAddressForm.tsx` 导出冻结受控表单，供 T11 直接复用。传入校验器的可选 translate 可用于英文错误提示。

## 下单操作生命周期

金额契约补齐前不要从页面启用这些交易方法。后续由 T6 在页面中连接：

- 模块生命周期创建一次 `new CheckoutOrderStore(checkout, skuCartStore)`；`dispose()` 清理监听与内存操作。此 store 在 `checkout/CheckoutOrderStore.ts`，不是 T12 自行管理的重放队列。
- 用户确认意图后 `store.prepare(snapshotId, {shippingAddress, couponId?})`。items 只从 T4 快照复制；不接受客户端第二份商品列表。相同快照/内容复用实例；未发送或明确拒绝且意图变化可换键，结果未知/处理中/冲突/已成功时禁止改变意图换键下单。
- `OrderSubmission.submit()` 返回 `{orderId}`，同实例重试复用键和请求体；失败 reject，`getStatus()` 区分 unknown/conflict/rejected。已成功不再次创建。不能把 unknown 状态当失败创建第二个实例。
- 离页 `deactivate()`，返回页面 `activate()`；成功结果只存在本操作内，不自动导航。`reconcile()` 单独交 T4 处理快照，失败不丢失 orderId，用户可以再次核对购物车。
- `continueToPayment(navigate)` 只在当前账号/页面有效且已知成功时执行 `navigate('CommercePayment', {orderId})`，不传金额、地址或订单对象。T4 核对失败后保留订单，不能以重新下单恢复。
- 不保证进程重启后恢复未决操作：当前没有安全持久化契约。账号切换清除 store；即使相同 userId 重新登录，也拒绝旧 generation。

旧 `screen.tsx`、`repository.ts::createOrder(http, lines)`、`types.ts` 兼容签名保持不变，避免其他旧总测试和兼容工厂无法编译。正式 T12 模块基线已停用旧下单链路；新页面和 repository 不调用 `/v1/commerce/orders`。删除旧兼容层属于 T12 后续工作。

## 文件范围与验证依赖

T6 新增 `CheckoutScreen.tsx`、`useCheckout.ts`、`CheckoutOrderStore.ts`、`OrderSubmission.ts`、`api.ts`、`contracts.ts`、`shippingAddress.ts`、`ShippingAddressForm.tsx`、本说明；更新 `translations.ts`。测试为 `__tests__/checkoutApi.test.ts`、`checkoutScreen.test.tsx`、`checkoutSubmission.test.ts`、`checkoutOrderStore.test.ts`。

仅为本地编译复制的 T5 依赖：`src/modules/commerce/coupons/contracts.ts`，来源 `C:/Users/30728/.codex/worktrees/22a8/react-native-application-template/src/modules/commerce/coupons/contracts.ts`，保持原文且与冻结定义一致；不是 T6 交付，不覆盖 T5 后续文件。T6 使用 React.ComponentType<CouponSelectionProps> 注入真实组件；本阶段未复制 T5 组件实现。T4 已在基线。

预览脚本/冻结 Swagger/截图在忽略目录 `artifacts/`，均不是生产装配。原生预览使用现有 Android debug 宿主 APK + 本次 T6 JS Bundle，独立只读 emulator-5586 / 本地 8096；购物车、选券和试算为明确测试替身，无真实后台请求。六宽度 375/768/1024/1280/1440/1920（Android dp）检查了单栏、最大内容宽度和滚动；实际输入、空表单错误汇总、原始试算值、金额未知禁提交已验证。未完成真机、iOS 原生、完整 T5 交互、深色/多品牌原生视觉验收。

质量检查：typecheck、lint 已通过；所属 4 套/38 项通过；最终完整测试 48 套/550 项通过。Android/iOS 标准 JS Bundle 和包含全部 T6 新模块的独立 Bundle 均通过。Metro 在沙箱内发生 spawn EPERM，使用同一构建参数在沙箱外通过，未削弱构建校验。
