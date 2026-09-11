# T11 秒杀交接

基线 `04ba07508ee969ba6c6f746582b798c1f1624cf9`，包含 T12 第二批 T3/T4 集成。冻结 Swagger SHA-256：`23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`。无公共装配、生产依赖、lock、commit 或 push 修改。

## T11 交付范围

- `seckill/index.ts`：公开入口。
- `repository.ts`、`types.ts`：四个移动端接口、一次 data 解包、Decimal 原值及响应校验。
- `SeckillStore.ts`、`state.ts`：账号隔离、活动时间/限购、令牌和提交状态。
- `screens.tsx`、`translations.ts`：活动列表/详情、T6 收货表单、双语状态与操作。
- `testing/fixtures.ts`：所属测试数据，不被业务入口导入。
- `__tests__/seckillRepository.test.ts`、`seckillStore.test.ts`、`seckillScreens.test.tsx`。

## T12 装配

模块工厂中创建一次，不在页面 render 时创建：

```ts
const repository = new SeckillRepository(services.http);
const store = new SeckillStore(repository, services.session);
const { SeckillListScreen, SeckillDetailScreen } = createSeckillScreens(
  repository,
  store,
);
// 模块 dispose 调用 store.dispose()。
```

可注入的 `SeckillPort` 为 list/get/token/request；HTTP 实现复用 HttpClient，store 复用 SessionManager。所有四个冻结接口均声明 bearer，因此列表/详情也按鉴权请求，匿名页面提供 `Login` 入口。

| routeName             | 页面                | params                 | 标题键                       |
| --------------------- | ------------------- | ---------------------- | ---------------------------- |
| CommerceSeckill       | SeckillListScreen   | 无                     | commerce.seckill.title       |
| CommerceSeckillDetail | SeckillDetailScreen | `{activityId: string}` | commerce.seckill.detailTitle |

合并 `seckillTranslations['zh-CN'/'en-US']` 的 `commerce.seckill.*` 命名空间，并接入 T6 的 `commerce.checkout.address.*` 翻译。沿用现有 commerce 品牌/权限过滤；Cedar 截图仅主题兼容预览，不要求开启正式商城。没有支付或订单导航需求。

`SeckillStore` 第三个参数 `SeckillPricePresenter` 只能由已核实 **seckillPrice 单位、币种和展示规则** 的装配方提供。返回有意义的格式化价格才允许提交；默认返回 undefined，页面显示价格未确认并禁止确认提交。不能套用旧 `priceMinor`、默认 CNY、parseFloat 乘除或用测试 presenter 开启生产行为。独立测试中 `TEST PRICE` 仅验证协议与状态，不代表真实价格契约已补齐。

## 操作安全边界

- 签发 token 虽为 GET，仍显式 `retry: 0`，不缓存；POST 同样 `retry: 0`。没有秒杀幂等头契约，不捏造 Idempotency-Key。沿用 core 的一次 401 刷新机制及其已冻结前提。
- 数量必须是 1–10 整数，且不超过当前 availableStock/perUserLimit；界面时间基于设备本地时钟，仅展示与前置约束，服务端负责最终资格与库存。
- 令牌仅保存在 store 私有字段，绑定当前活动/账号/页面生命周期，使用服务端 expiresAt，提交或离页即清除。地址只保留在详情表单的局部状态，不写日志/URL/缓存。
- 连点不会启动第二次取令牌或提交。发送后的错误一律保守视为结果未知，不将 HTTP 错误擅自解释为未产生副作用。
- 发送记录按 userId/activityId/skuId 隔离；当前模块存活期间，发送中、已入队或结果未知均不开放再次提交同一活动 SKU。离页发送中转为未知，迟到响应不改变新页面或账号。退出再登录同账号也不会复用旧令牌/地址。
- 记录仅在内存中；模块 dispose/应用重启后不保证跨重启防重。没有持久化或服务器操作标识协议，不声称精确一次。若需要再次购买同 SKU 或恢复未知操作，先补结果与幂等契约，不能清记录强行重发。
- QUEUED/requestId 仅表示入队。无结果查询/orderId 关联接口，不轮询管理员对账、不遍历订单猜归属、不展示抢购成功。

## T6 依赖来源（不是 T11 改动）

任务 `01a091de-9b13-7242-8ee0-d7a4427b687f`，工作区 `C:/Users/30728/.codex/worktrees/5cc7/react-native-application-template`。收到交付通知后，原样复制以下文件到当前工作区供类型/测试/渲染验证，未修改其实现：

| 文件（checkout/）       | SHA-256                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| shippingAddress.ts      | 8ee445aa6e55f3186f906ea6026039ec1ded6521c61e2374d01356338ba1e91f |
| ShippingAddressForm.tsx | a38f0279bde6d6e124f14ec4565f1e8158df1c337853fe6240aa5632e6584207 |
| translations.ts         | 2ab8c693e1af86e5275740108bb42c7b5e5111cc776b17bbd2bfff175a267475 |

T12 应从 T6 集成这些依赖；不要把本地 status 中的三份 checkout 差异计入 T11 交付，或用它们覆盖 T6 后续版本。

## 验证与限制

- npm run typecheck、npm run lint 通过；全项目 47 套 / 546 项测试通过（T11 为 34 项）。测试包含真实 HttpClient + 模拟 fetch，不是真实后端联调。
- npm run bundle:android、npm run bundle:ios 通过；原命令沙箱内 Metro spawn EPERM，沙箱外通过，未修改构建逻辑。
- 因正式装配尚未引用 T11，另用忽略目录 `artifacts/t11-build-entry.js` 导入 T11，生成包含新模块与真实 T6 依赖的 Android/iOS production JS Bundle，均通过。
- 原生视觉验收使用独立只读 emulator-5590 / Metro 8111，忽略目录独立入口直接加载正式组件和模拟 HTTP。截图/脚本/日志位于 artifacts/t11-\*；不修改正式路由或品牌开关。
- 已检查两主题、zh-CN/en-US、375/768/1024/1280/1440/1920 六宽度的列表与详情，共 48 张原生截图；另有 13 张状态截图，覆盖加载、错误、空活动、空 SKU、结束、售罄、金额未确认禁用、地址错误、令牌就绪/过期、排队和结果未知。实际通过原生共享表单填写并提交到本地模拟接口，收到 QUEUED 后只显示编号。错误/未知截图底部的 LogBox 是开发包对模拟 HTTP 失败的日志提示，不是业务提示。
- 原生验收修正了 Hermes locale 日期显示，以及把令牌/提交错误放在表单操作旁；修正后已重新检查相应状态。未做鼠标 hover 或 iOS 键盘/真机验收；Android 触控、输入框焦点、滚动与禁用状态已检查。
- 金额确认、requestId 结果闭环仍被后端契约阻塞；未进行真实秒杀写入、真实订单关联、iOS 真机或原生安装包构建验收。

当前工作区：`C:/Users/30728/.codex/worktrees/ba5d/react-native-application-template`。
