# T9 退款与售后交接

本目录交付冻结 Swagger 的退款与售后申请、操作状态、表单与中英文翻译。基线为 `04ba07508ee969ba6c6f746582b798c1f1624cf9`（包含 T12 第二批 T3/T4 集成），Swagger SHA-256 为 `23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`。

## T12 装配

从本目录 `index.ts` 导入 `AfterSalesRepository`、`AfterSalesStore`、`createAfterSaleScreen`、`afterSalesTranslations`；契约类型从 `contracts.ts` 导出。

```ts
const afterSalesRepository = new AfterSalesRepository(services.http);
const afterSales = new AfterSalesStore(
  afterSalesRepository,
  orders, // T8 OrdersPort；每次 getForAfterSale 必须读取当前账号权威订单。
  services.session,
);
const AfterSaleScreen = createAfterSaleScreen(afterSales);
// 模块 dispose 调用 afterSales.dispose()。
```

工厂与 store 在模块装配时各创建一次，不能在 render 内重建。store 自行订阅 SessionManager，账号变化时清理记录并使旧响应失效；无需 T12 另写缓存清理逻辑。页面 effect 负责打开/离页保护。

- 注册需要登录的 `CommerceAfterSale`，参数严格为 `{orderId: string, orderItemId: string, quantity: string}`。quantity 仅接受正整数十进制文本；目标页重新校验关联与数量，提交前再次权威读取。
- 返回入口为 `CommerceOrders`。本目录不修改路由注册、菜单、品牌权限或原兼容入口。
- 合并 `afterSalesTranslations` 的 `zh-CN` / `en-US` 字典，全部键为 `commerce.afterSales.*`；路由标题可使用 `commerce.afterSales.title`。无需其他业务翻译键。
- `AfterSalesPort` 是低层提交接口；页面必须经 `AfterSalesStore`，不要绕过权威重读、同次申请互斥和生命周期保护。

## 行为及边界

退款只接受 `REFUND_ONLY / RETURN_AND_REFUND`，售后只接受 `REFUND_ONLY / RETURN_REFUND`，不接受响应中出现的 EXCHANGE。只发送 items、reason、相应 type 和售后可选 description，orderId 进入编码后的 URL，不发送金额。退款项 UUID 与 1–999 整数限制来自快照；售后正整数和非空原因属于客户端输入规则，数量同时受权威订单项限制。

两条 POST 均 `retry: 0`、默认鉴权、无共享 HTTP cache。退款幂等键只放一份 `Idempotency-Key` 请求头。首次确认保存独立意图与键；网络/5xx/损坏响应为结果未知，只允许显式重试原退款 body/key。409 不换键重试。原未知退款后续收到拒绝也不能证明首个请求失败，仍保留未知状态。售后结果未知不提供重放入口，不因用户改数量或切换流程创建第二申请。

同账号模块生命周期内按 orderId/orderItemId 保留结果，离页发送中的申请变为未知，迟到响应不恢复页面或导航。明确拒绝可重新核对并修改申请。退出/切账号清空记录；进程重启、模块重建及跨账号生命周期不保证本地幂等状态恢复，需后端用户申请查询/持久操作契约才能完善。成功只展示真实返回申请 ID 和状态，不将提交成功当成退款到账。

后端仍缺用户申请列表、详情、撤销和进度闭环；未调用 admin 接口。未核实金额单位/币种，因此不展示推算退款金额。资格与最终退款金额由服务端决定，不猜测未知订单状态的含义。

## 文件范围与依赖来源

T9 文件仅本目录和 `__tests__/afterSalesRepository.test.ts`、`afterSalesStore.test.ts`、`afterSalesScreen.test.tsx`、`afterSalesHttp.test.ts`。

本工作区另有用于编译验证的 `src/modules/commerce/orders/contracts.ts`：从 `C:/Users/30728/.codex/worktrees/faac/react-native-application-template/src/modules/commerce/orders/contracts.ts` 原样读取复制，来源 HEAD 同为 `04ba07508ee969ba6c6f746582b798c1f1624cf9`，文件 SHA-256 `395f855aa683e2228022134ef6c2c4ba5cb1b03b221c72ea01540680b5ec0cd8`，与冻结契约一致。此文件属于 T8，**不属于 T9 交付，不能覆盖 T12 收到的 T8 正式实现**。未复制或修改 T8 repository，订单运行时验证使用测试替身。

## 验证

- `npm ci --ignore-scripts` 和 `npm ls --depth=0` 通过；安装前检查无当前 d097 工作区依赖占用进程，未停止其他任务进程。未改生产依赖或根 lock。
- typecheck、lint 通过；所属 4 套 / 48 项测试通过，覆盖 DTO、真实 HttpClient 重试/401 路径、请求竞态、切账号、表单确认和错误恢复。
- 全量 48 套 / 560 项测试通过。个别总测试预期输出错误日志，没有测试失败。
- 现有 `bundle:android` / `bundle:ios` 通过；另用忽略目录 `artifacts/t9-entry.js` 引入 T9 公开导出，Android/iOS 直接 Metro Bundle 通过，确保未装配的新代码确实参与构建。沙箱内曾出现 Metro `spawn EPERM`，在允许子进程的环境重跑成功，没有改构建逻辑。
- 独立 React Native Web 预览使用实际 T9 组件、真实品牌 token、测试订单/提交替身。通过内置浏览器检查 375、768、1024、1280、1440、1920px；中英文和 Aurora/Cedar；输入焦点、选择、禁用、确认、提交中、成功、未知、错误与加载界面。未发现横向溢出，手机可滚动操作。Cedar 仅为主题兼容验证，不修改该品牌商城开关。
- 预览工具及入口仅在忽略目录 `artifacts/t9-preview/`，未成为生产依赖。Chrome 连接失败后内置浏览器成功。预览不代表真实后端联调，当前无连接 Android 设备，未做原生安装、原生键盘、iOS/Xcode/真机验证。

工作区：`C:/Users/30728/.codex/worktrees/d097/react-native-application-template`。未 commit、未 push、未进行 T12 公共装配。
