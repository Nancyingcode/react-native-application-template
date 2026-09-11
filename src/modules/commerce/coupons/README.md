# T5 优惠券交付

基线：`04ba07508ee969ba6c6f746582b798c1f1624cf9`，已包含 T12 第二批 T3/T4 集成。冻结 Swagger SHA-256：`23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`。副本位于本工作区忽略目录 `artifacts/swagger-latest.json`，未更新契约。没有导入其他任务的未交付文件。

## 实现与公开边界

- `repository.ts`：`CouponsRepository.my(status?)`、`available()`、`claim(couponTemplateId, idempotencyKey)`；导出 `UserCoupon`、`CouponStatus`、`couponStatuses`。使用注入的 HttpClient；响应拆 `data` 一次，校验字段，保留未知状态/类型，错误不吞掉。查询不使用共享缓存。
- `client.ts`：`CouponsClient(repository, session, optionalKeyFactory)`；`query('my' | 'available', status?)`、`claim(templateId)`、`getClaim(templateId)`、`subscribe`、`getGeneration`、`isAuthenticated`、`dispose`。业务消费者优先使用 client，以获得账号归属校验和幂等操作管理。
- `contracts.ts`：严格保持冻结的 `CouponChoice` 和 `CouponSelectionProps`；`CouponSelector.tsx` 导出 `CouponSelector(props)`。只通过 `onChange({couponId: UserCoupon.id})` 返回实例 ID；不返回模板 ID，也不计算订单优惠。
- `context.tsx`：`CouponsProvider({client, children})`。选择器、账户页面及领取组件需要同一个 provider；未配置时明确报错，不创建另一套生产客户端。
- `CouponsScreen.tsx`：`CouponsScreen()`，全部/可用/锁定/已用/过期/取消筛选；加载、错误、刷新、空状态及匿名提示。
- `CouponClaim.tsx`：`CouponClaim({couponTemplateId, name})`，仅在确有真实活动或商品模板来源时挂载。空 ID 不显示入口；不提供任意 ID 输入框或虚构可领券目录。
- `translations.ts`：`couponsTranslations`，完整 `zh-CN`/`en`，前缀 `commerce.coupons.*`。`index.ts` 聚合上述主要导出。
- `useCoupons.ts` 和 `ui.tsx`：局部查询代次保护、主题化卡片、筛选按钮和状态展示。

## T12 装配清单

在 commerce 模块创建时创建一次：

```tsx
const coupons = new CouponsClient(
  new CouponsRepository(services.http),
  services.session,
);
```

在优惠券页面和 T6 结算页面外分别包装 `<CouponsProvider client={coupons}>…</CouponsProvider>`，或在共同父级提供。组件工厂在装配时创建，不能在 render 中重建 client。模块 dispose 调用 `coupons.dispose()`；provider 本身不 dispose，因为它可能被多个路由共享。

注册 `CommerceCoupons`，无参数、需要登录，标题键 `commerce.coupons.title`；菜单位置由 T12 决定。合并 `couponsTranslations` 的两语言字典。保持现有品牌开关；Cedar 预览只是主题兼容检查，不要求为其启用 commerce。

T6 直接 import `coupons/contracts.ts` 和 `coupons/CouponSelector.tsx`。账户 available 不是当前订单可用的保证；T6 仍需权威试算及错误处理。已选券不在新列表时显示说明，不在 effect 中偷偷调用 onChange；T6 对账号变化清除其结算意图，并按自己的 snapshot/owner 契约阻止下单。

## 幂等、账号和金额约束

- 领取发送 POST，无自造 body，路径 ID 编码，只有一个 `Idempotency-Key` 请求头，`retry: 0`。共享 HttpClient 的一次 401 刷新沿用相同请求，不修改 core。
- 同模板正在发送时共享 Promise，未知结果和失败后显式重试保留同一键；页面卸载/重挂载不会重置该操作。成功后按钮禁用，不把同一次点击变为第二次领取。不同模板创建不同操作。
- 400 等明确客户端拒绝显示失败与服务端消息；408/409/5xx、网络失败、响应无法核实保守显示结果未知。保留 ApiError 的 status/code/message/requestId，409 不换键绕过。
- 操作记录只在模块实例内存保存。退出/换账号清空并增加代次，退出后重登同一 userId 也不会复用旧操作。旧响应不能写进新账号状态。正常 token 刷新不清理当前账号操作。没有跨进程持久化，跨重启不能保证继续原幂等操作。
- 查询数据只保存在对应 Hook；筛选切换、刷新、卸载及账号变化后拒绝迟到列表。领取结果保存在同账号操作记录中用于重挂载核对，不触发导航或全局通知。
- UserCouponResponseDto 没有券面金额、门槛或币种；只展示名称、类型、服务端状态、有效期、不可用原因。没有金额转换、零元兜底或默认 CNY。

## 验证

- `npm ci`：首次沙箱 spawn EPERM，检查本工作区没有相关进程后在沙箱外成功；`npm ls --depth=0` 完整。项目 package.json/package-lock.json 没有变化。
- `npm run typecheck`、`npm run lint` 通过。
- 全量 Jest：47 套、540 项通过；T5 三套共 28 项。覆盖真实 HttpClient 请求形状/鉴权/401 刷新/无副作用重试，非法响应，幂等、账号变化、旧响应、卸载、受控选券及两品牌两语言交互。
- `npm run bundle:android`、`npm run bundle:ios` 通过。Android 首次沙箱内 Metro 初始化失败，原命令沙箱外通过。另通过忽略目录的 `coupons-native-entry.js` 显式导入 T5，分别生成 Android/iOS JS Bundle，确保新目录也经过 Metro。
- 实际浏览器预览直接打包本次组件，以 react-native-web 渲染；仅 ApplicationProvider 和 API 数据使用预览替身。两品牌 × 中英文 × 375/768/1024/1280/1440/1920 共 24 组布局无横向溢出；375px 长标题/日期正常换行，大屏宽度受限。检查筛选、选中/清除、加载、空、错误、领取成功/未知、禁用及键盘焦点。修正选项 aria-checked 后辅助功能树确认选中值变化。
- 预览工具和 fixture 全部在忽略目录 `artifacts/coupons-preview`；其临时依赖不属于项目生产依赖。构建脚本 `node artifacts/coupons-preview/build.cjs`，预览服务 `node artifacts/coupons-preview/server.cjs`（本次使用 127.0.0.1:18755）。这些工具不应作为 T12 生产装配导入。

## 未完成的环境/契约验收

ADB 没有连接设备，未进行 Android 原生安装及 TalkBack 验收；当前 Windows 环境没有 iOS Xcode/真机验收。浏览器 fixture 交互与 JS Bundle 不能代替原生验收或真实后端联调。没有真实模板目录来源和用户凭据，未向真实后端领取优惠券；不宣称真实领取/订单试算闭环完成。生产路由和翻译合并按任务边界留给 T12。

交付范围仅本目录及 `__tests__/couponsClient.test.ts`、`couponsRepository.test.ts`、`couponsScreen.test.tsx`；无 commit/push。工作区：`C:/Users/30728/.codex/worktrees/22a8/react-native-application-template`。
