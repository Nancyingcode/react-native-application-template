# T8 订单中心交付

基线：`04ba07508ee969ba6c6f746582b798c1f1624cf9`，含 T12 第二批 T3/T4 集成。冻结 Swagger 已复制到本工作区忽略目录 `artifacts/swagger-latest.json`，SHA256：`23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`。未修改公共入口、其他任务代码、依赖清单或 lock，未提交/推送。

## T12 装配

```ts
import {OrdersRepository, createOrdersScreens, ordersTranslations} from './orders';

const orders = new OrdersRepository(services.http, services.session);
const {OrdersScreen, OrderDetailScreen} = createOrdersScreens(orders, services.session);
```

在模块装配时创建一次；模块销毁调用 `orders.dispose()`，释放账号监听和内存操作记录。页面卸载自行失效请求代次。repository 不使用共享认证缓存。退出/切账号清理未决操作；刷新 token 不清理同一账号的数据。操作记录仅在当前应用实例有效，不宣称跨重启持久化。

- 注册需登录的 `CommerceOrders`（无参数）及 `CommerceOrderDetail`（`{orderId: string}`）。建议从个人账户区提供“我的订单”菜单。
- 将 `ordersTranslations` 合入 commerce 两语言翻译。所有新增键为 `commerce.orders.*`，标题使用 `.title` / `.detail`；未知订单状态显示“未确认”及原值。
- 待支付订单只导航 `CommercePayment`，仅传 `{orderId}`；T7 仍须重新读取权威支付数据并处理金额单位缺口。这里不创建支付单、不拉起支付。
- 已支付/处理中/已发货/已完成/部分退款订单的商品入口导航 `CommerceAfterSale`，只传 `{orderId, orderItemId, quantity: String(quantity)}`；这只表达申请意图，不保证售后资格。
- T9 注入本实例作为 `OrdersPort`，从 `orders/contracts.ts` import `OrdersPort` / `OrderForAfterSale`，调用 `getForAfterSale(orderId)`；权威读取、不使用页面快照，不提供客户端退款金额。
- 本次没有复制任何 T5–T11 依赖文件；T7/T9 通过冻结导航和 port 契约衔接，公共路由注册仍由 T12 完成。

## 行为

`list(filter?, page?, pageSize?)` 支持 status、orderNo、createdFrom、createdTo；页面提供状态与订单编号筛选。`listCursor(after?, limit?)` 独立导出，不混入分页筛选参数。`get` 返回订单、金额原始字符串、收货信息和状态时间线，保留订单状态与支付状态的区别。

取消仅对待支付订单提供确认入口，`cancel(id, {idempotencyKey})` 使用同次意图的键及 `retry: 0`；确认收货仅对 SHIPPED 提供入口，`confirmReceipt(id)` 不虚构请求体/幂等头，`retry: 0`。二者成功或失败后均重新读取详情，包括取消与支付竞态。Receipt 响应不是完整订单 DTO，不直接替代详情。未知状态无变更入口。

同步锁避免重复确认；网络未知或幂等处理中结果在 repository 内跨页面保留，`isActionBlocked(id)` 可查询，仅刷新核对，不自动重放。权威 CANCELLED / COMPLETED 分别解除对应未决状态；重新读取仍不能确认时继续提示未知结果。HTTP 401 刷新重发仍遵循 core 既有契约。

金额只显示“服务端原始金额/单位待确认”，不乘除 100、不猜币种、不用于确认支付或自行计算退款。物流轨迹无接口，不创建虚构页面。

## 验证与限制

- npm ci --ignore-scripts --offline 安装独立依赖前，已检查本工作区 Node/Electron/esbuild 进程，未发现占用；未结束其他任务进程。安装成功，未改 lock。
- `npm run typecheck`、`npm run lint` 通过。所属 3 套/12 项测试通过，覆盖两品牌/中英文、确认/取消确认、支付竞态、未知状态、分页竞态、退出/重新登录隔离、迟到结果、跨页面未知操作保护、原始金额与请求格式。
- 全量 47 套/524 项测试通过，日志：`artifacts/t8-tests-final.log`。
- `npm run bundle:android`、`npm run bundle:ios` 通过。原沙箱出现 Metro `spawn EPERM`，以同一命令在沙箱外通过，未修改构建配置。
- 因公共入口未挂载 T8，另用 `artifacts/t8-entry.js` 直接引用新模块，原 Metro 配置的 Android/iOS Bundle 均通过；日志为 `artifacts/t8-direct-android.log` / `t8-direct-ios.log`。
- ADB `devices -l` 无连接设备，未完成原生真实页面、375/768/1024/1280/1440/1920 的两品牌/两语言截图和 Visual QA。组件交互测试不等于真实渲染验收，Cedar 主题测试不改变其商城功能开关。
- 未进行真实后端、取消/收货写入联调、原生 APK/AAB、iOS Xcode/真机验收。金额单位/精度需后端明确；物流轨迹契约仍缺失。T12 路由集成及真机视觉验收尚待完成。

工作区：`C:/Users/30728/.codex/worktrees/faac/react-native-application-template`。
