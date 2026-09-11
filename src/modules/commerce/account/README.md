# T10 交付：会员、积分与站内消息

基线 `04ba07508ee969ba6c6f746582b798c1f1624cf9`，包含 T12 第二批 T3/T4 集成。冻结 Swagger SHA-256：`23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`。未修改公共装配、兼容导出、路由配置、公共文档、依赖清单或 lock；未提交、推送。

## T12 装配

从 `commerce/account/index.ts` 和 `commerce/notifications/index.ts` 导入：

```tsx
const account = new AccountStore(
  new AccountRepository(services.http),
  services.session,
);
const notifications = new NotificationsStore(
  new NotificationsRepository(services.http),
  services.session,
);
const Account = createAccountScreen(account);
const Notifications = createNotificationsScreen(notifications);
```

工厂与 store 在模块装配时各创建一次，不在 render 中重建。注册需登录的 `CommerceAccount`、`CommerceNotifications`，均无参数。路由标题分别使用 `commerce.account.title`、`commerce.notifications.title`。合并 `accountTranslations` 与 `notificationsTranslations` 的 `zh-CN`、`en-US` 字典；通知页面也使用 account 的加载/错误/刷新文案。

徽标由 T12 在合适的入口装配：

```tsx
<UnreadBadge
  store={notifications}
  onPress={() => navigate('CommerceNotifications')}
/>
```

徽标与消息页面必须共享同一个 store，不能创建第二份未读计数。挂载读取第一页及计数，以避免徽标和页面同时挂载时一个加载遮蔽另一个加载。页面和徽标 cleanup 调用 `cancelPending()` 使未完成请求失效；该操作不会取消已发送 HTTP。共享实例任一消费页面离开会使该实例在途请求失效，仍挂载的页面可刷新恢复。退出/切换账号自动清空余额、列表及计数；Token 续期不视为切换账号。模块销毁时调用两个 store 的 `dispose()` 释放会话监听并清空内存。禁止将实例跨应用生命周期复用。

`AccountScreen({store})`、`NotificationsScreen({store})` 也直接导出供测试或页面组合。两个 store 的 `subscribe/getSnapshot` 可用于 `useSyncExternalStore`。UI action Promise 的错误转为 snapshot.error，不产生未处理拒绝；repository Promise 保留原始 HTTP 异常供其他业务调用者处理。所有数据不使用 HttpClient 共享 cache，不持久化。

## API 与行为

- `AccountRepository.member()`、`points()`：读取会员资料与积分余额。AccountStore 校验账号及积分安全整数后发布。
- `AccountRepository.spend({amount, sourceId})`：正安全整数积分与非空业务来源；原样 DTO、`retry: 0`。同一业务意图显式重试须保留原 sourceId；不创建随机兑换来源、不自动重试、不增加 Swagger 未声明的幂等头。调用方仍须管理所属账号、业务兑换结果及不确定状态。当前没有真实兑换业务目录，所以没有兑换 UI。
- `NotificationsRepository.page(after?, limit=20)`：使用 cursor 接口，编码不透明 after，limit 为 1–100 整数。`recent()` 独立保留最近 100 条接口，页面不调用它。
- `unreadCount()`、`read(id)`、`readAll()`：校验权威响应，POST 全部 `retry: 0`。单条已读提交成功才改该行，并重新读取全局计数；全部已读成功重新读取第一页与计数，允许期间新消息使计数仍大于零。
- 提交失败保留原列表和计数并显示刷新提示；提交成功但计数刷新失败时计数显示待更新，不伪造零。重复点击在请求进行中被阻止。分页失败保留已载入行与游标，支持手动重试；去重重复 ID，并拒绝不前进的游标。
- 所有跨 await 更新检查请求代次；离页、退出、账号切换或 dispose 后迟到响应不更新页面、徽标，不触发后续请求。站内消息拒绝其他账号或非 IN_APP 响应。

## 修改范围

- `account/`：`repository.ts`、`AccountStore.ts`、`OwnedStore.ts`、`ui.tsx`、`screen.tsx`、`translations.ts`、`index.ts`、本说明。
- `notifications/`：`repository.ts`、`NotificationsStore.ts`、`screen.tsx`、`UnreadBadge.tsx`、`translations.ts`、`index.ts`。
- 测试：`__tests__/accountRepository.test.ts`、`accountStore.test.ts`、`accountScreen.test.tsx`、`notificationsRepository.test.ts`、`notificationsStore.test.ts`。
- 未复制其他并行任务的实现；只依赖基线提供的 HttpClient、SessionManager、ApplicationProvider、navigation、PrimaryButton。

## 验证记录

- `npm run typecheck`、`npm run lint`：通过，无新增 lint 警告。
- `npm test -- --watch=false`：49 套 / 548 项通过；其中 T10 为 5 套 / 36 项，覆盖副作用请求、sourceId、分页、去重、错误恢复、注销/切账号/同账号退出重登、离页、dispose、徽标与页面同步、中英文及全部已读确认。
- `npm run bundle:android`：通过。正式入口尚未装配 T10，另用忽略目录 `artifacts/t10-native-entry.js` 引入 T10 两个 index，对 Android/iOS 分别执行 Metro bundle 验证新增模块，两者均通过（artifacts/t10-android.bundle、artifacts/t10-ios.bundle）。
- 本地独立 React Native Web 预览渲染实际 T10 组件，repository 使用明确测试替身；检查 375/768/1024/1280/1440/1920px、中文 Aurora、英文 Cedar、加载/错误/空状态、单条/全部已读、确认/取消、分页结束、禁用及键盘操作。桌面内容限制 800px，未发现横向溢出。Cedar 仅验证主题兼容，不启用该品牌商城。
- 临时预览依赖与入口仅在忽略目录 `artifacts/t10-preview/`；未加入生产依赖。初始 npm ci 在沙箱内出现 spawn EPERM；检查没有本工作区依赖占用进程后，在授权执行环境重试通过。

## 明确未验证/待补契约

没有真实后台账号、积分兑换目录/奖励发放闭环；未发起真实扣积分或消息写操作。会员 discountRate/pointsMultiplier 未声明比例刻度，不推导折扣百分比或优惠金额，页面提示规则待确认，免运费仍以结算资格为准。Swagger 的 SpendPointsDto.sourceId 是业务字符串，而流水 sourceId 标注 UUID；客户端保留原字段，未擅自归一化或改契约。

未连接 Android 设备；本次未进行原生安装/真机交互，Windows 上未进行 Xcode/iOS 原生验证。React Native Web 的页面渲染、测试替身和 JS Bundle 均不代表真实后端联调或原生验收。最终路由、权限、品牌入口及跨模块退出链路由 T12 统一装配验证。
