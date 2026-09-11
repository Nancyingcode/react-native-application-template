# T3 商品目录交付

## master 同步回归（2026-09-12）

已通过 SSH fetch 并将当前 worktree 快进到 `origin/master` 的 `106204393ff23cbfca2b4f7bbe84109e33e4bdab`，原有 T3 未提交修改完整保留，无冲突。新基线的 typecheck、lint、全量 Jest（41 套、494 项）和 Android/iOS JS Bundle 均通过。

该提交的 T12 交接说明明确为“第一批交接”：完成登录/退出装配，商城后续装配仍待业务交付。当前 `cart/contracts.ts` 和 `CartCheckoutPort.addItem` 实现仍不存在，不能将旧 `CartStore.add(product)` 用作 SKU 加购替身；以下装配与金额缺口仍然有效。ADB 再次检查没有连接设备，原生视觉 QA 仍未完成。

## 实现与装配

- `api.ts` 导出 `CatalogRepository`、`SearchFilter`、`SearchSort`、`SearchPage`、`SearchProduct`、`CatalogSku`、`SkuInventory`。
- `CatalogRepository` 提供 `search`、`hot`、`listSkus`、`getSku`、`inventory`，复用注入的 HttpClient，不创建第二套客户端。
- 目录继续使用 `/products?page=…&pageSize=…`，搜索使用 `/search/products` 页码分页；SKU 主路径为 `/products/{id}/skus`。不重复调用 cursor 或 `/skus?productId=`。
- `useSearch.ts` 隔离筛选变更、刷新、追加分页和卸载后的迟到响应；`SearchPanel.tsx` 提供搜索、热词、服务端排序、按返回的真实分类 ID 筛选、空结果及错误恢复。
- `SkuPicker.tsx` 导出 `CatalogIntegration` 和 `SkuPicker`。SKU 必须显式选择；数量为 1–99 的整数。登录后查询库存，加购前再读取 SKU 和库存，库存未知与零库存分别处理。匿名用户不会请求鉴权库存。
- `screens.tsx::createCatalogScreens` 新增可选第三参数 `CatalogIntegration`，传入后启用搜索与 SKU 加购。原两参数调用保留兼容行为，公共工厂、路由、购物车和聚合测试均未修改。
- `translations.ts` 增加中英文 `commerce.products.search.*` 和 `commerce.detail.sku.*`。

T12 在现有工厂装配位置接入第三参数：

```ts
createCatalogScreens(repository, cart, {
  repository: new CatalogRepository(services.http),
  addItem: (skuId, quantity) => cartCheckoutPort.addItem(skuId, quantity),
});
```

无需新增路由：仍使用 `CommerceProducts`、`CommerceProductDetail`（只传 `productId`）和 `CommerceCart`。工厂和 integration 在装配阶段创建一次。目录加购仅使用公开 `addItem(skuId, quantity)`，不访问 T4 内部状态。

当前基线没有 T4 的 `cart/contracts.ts`，因此未创建该文件，也没有复制 `SkuSelection` 类型。这里通过方法参数接收 SKU 与数量。T4/T12 交付后可将 integration 的方法类型收窄为 `CartCheckoutPort['addItem']`；T12 同时将旧购物车徽标订阅换成 T4 的实际展示 API。旧两参数入口仍存在旧 productId 加购，不能把兼容入口运行当成新版 SKU 加购已完成装配。

## 金额与契约缺口

冻结快照在忽略目录 `artifacts/swagger-latest.json`，SHA-256 为 `23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`。

搜索 `salePrice` 保留 number；SKU `price/originalPrice` 保留 Decimal 字符串。读取本机后端 `modules/search/application/product-search-indexer.service.ts` 与 `search.service.ts` 确认搜索使用 `basePrice.toNumber()`，没有乘除 100；价格过滤也直接比较 basePrice。但冻结搜索响应没有 currency，SKU 也未明确金额主/辅币单位。因此不补 CNY、不把未知金额设为零、不映射为旧 priceMinor。搜索显示“查看详情确认价格与币种”，SKU 显示金额单位待确认；旧商品展示维持既有行为。价格范围参数已在 repository 校验与支持，界面暂不提供缺少币种说明的数值价格区间输入。

加购只表达 SKU/数量意图，不确认订单金额。金额展示仍需后端确认后由 T12 装配；不能据此宣称价格或下单闭环已联调。

## 验证与剩余验收

所属测试：`catalogRepository.test.ts`、`catalogSearch.test.tsx`、`catalogSku.test.tsx`、`catalogScreen.test.tsx`。覆盖 URL 编码、分页、Decimal/number 保留、错误传播、筛选竞态、空结果、重试、SKU 身份校验、匿名库存、库存不足、迟到库存、重复加购、失败不自动重放、退出后的迟到结果，以及两品牌中英文搜索交互和输入框 Focus。

TypeScript、ESLint、全量 Jest、Android/iOS JS Bundle 均执行。Bundle 曾因沙箱 spawn EPERM 和外部依赖路径失败；复制现有依赖到当前工作区后，以原 Metro 配置和原 npm scripts 通过。没有安装新依赖、修改 lock、提交或推送。

未完成真实 API 联调及原生视觉 QA：ADB 当前没有连接设备。375/768/1024/1280/1440/1920 宽度的两品牌中英文截图验收需连接设备后继续；组件测试不是视觉验收，JS Bundle 也不是原生构建验收。


## T12 装配更新（2026-09-12）

本工作区已接入 T3＋T4，以上“等待 T12/T4”的段落为原任务交付时记录。正式 commerce 模块使用新 SKU 购物车和公开 addItem，目录徽标订阅同一 store，模块 dispose 释放会话监听。没有把旧 productId 转为 skuId。

T6 仍未交付，因此正式 CommerceCheckout 暂时显示不可用并可返回购物车，旧下单/支付工厂仅保留兼容导出。完整集成范围与验证见 docs/swagger-parallel-tasks.md 的 T12 第二批记录。
