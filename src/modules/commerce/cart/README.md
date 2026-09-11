# T4 购物车交付

## 接入（T12）

新增实现均在本目录；旧 `CartStore`、`createCartScreen` 和旧商品/结算调用保持兼容，没有将旧 productId 伪装成 skuId。

```ts
import { CartRepository, SkuCartStore, createSkuCartScreen } from './cart';

const skuCart = new SkuCartStore(new CartRepository(services.http), services.session);
const CartScreen = createSkuCartScreen(skuCart, legacyCart);
```

- 在装配阶段创建一次，销毁应用服务时调用 `skuCart.dispose()`；不要在 render 内创建 store 或页面工厂。
- T3 调用 `addItem(skuId, quantity)`；quantity 是增量，整数 1–99。
- 将现有 `CommerceCart` 路由切换到新工厂；访客可访问。
- T6 接收 `CommerceCheckout` 的 `{snapshotId}`，通过 `getCheckoutSnapshot` 读取并核对 owner；快照丢失返回购物车。不可再使用旧支付成功后整车 clear 的连接。
- `captureCheckout` 刷新后只取有效、选中、可售且库存足够的项；快照及嵌套项冻结。会话用户变化后旧快照失效。
- `reconcileOrder` 核对已知快照并刷新，不发 DELETE/PATCH；显式 items 下单后的后端清理细则尚未明确，不能推断已购数量从而误删新增数量。
- `cartTranslations` 已包含新页面两语言文案，既有 commerce 聚合翻译自动组合该对象。
- 传入旧购物车时，页面保留旧商品并提示重新选择规格；不自动迁移或清空旧内容。

## 行为与限制

所有服务端修改均关闭网络重试，以服务端 cart item id 修改/删除；SKU 仅用于加购和结算。读取、修改和快照操作串行执行；账号切换使旧队列和迟到响应失效。

访客 SKU 通过公开 SKU 详情验证后保存在内存；未登录不调用库存或购物车接口。登录不会自动上传，用户明确确认后逐项合并。成功项不再发送；未知结果先刷新、保留来源和目标账号，用户核对后选择已添加或允许再次提交，再点击确认合并。另一个账号无法承接该合并。客户端数量相同不构成成功证明。

合并进度仅限当前应用实例，无跨重启持久化/精确一次保证。需要后端合并操作标识或持久化契约后扩大范围。原始金额字符串直接标注展示，不换算、求和或作为下单金额。

现有 HttpClient 的 401 刷新重发机制不由 T4 改动；沿用冻结契约中“401 未产生业务副作用”的前提。

## 验证

- 已核对冻结 Swagger SHA-256：`23cc5e607f8c8046f7a50b309e298cb22601be2d6a2250545d5134173909c5d0`，快照复制到忽略目录 artifacts。
- 新增 `cartSku.test.ts` 与 `cartScreen.test.tsx`，覆盖请求 DTO/重试、串行数量更新、未知合并、账号隔离、不可变快照、清理策略、删除确认和路由参数；旧 `commerceCart.test.ts` 保持通过。
- `npm run typecheck`、`npm run lint`、`git diff --check` 通过；在 master `1062043` 基线上全量 Jest 39 套、491 项通过。
- 已确认当前工作区无依赖占用进程，将主工作区依赖复制为本工作区独立 node_modules，替换原目录联接；未修改主工作区依赖或 lock 文件。
- 正式 `npm run bundle:android`、`npm run bundle:ios` 在沙箱外均通过；另以 artifacts/t4-entry.js 显式引用新 cart 模块，两平台 Bundle 均通过，使用原 Metro 配置与 Split Bundle 检查。
- 上轮目录联接导致的 `Module outside project` 已通过独立依赖解决，未修改或弱化公共构建规则。
- ADB 无连接设备，未完成真实原生页面、两品牌/两语言及 375/768/1024/1280/1440/1920 视觉验收；组件测试不冒充 Visual QA。
- 未进行真实购物车写入、下单、支付或服务端联调，未 commit/push。


## master 同步说明

2026-09-12 已通过 SSH fetch 并 fast-forward 至 `1062043`，保留全部未提交 T4 文件。该提交的 T12 交接明确为第一批认证装配，T3–T11 仍待交付；当前公共商城仍使用旧商品/购物车/结算工厂，因此没有强行把新 SKU 购物车接入旧 productId 下单流程。继续按上面的 T12 接入清单交付。

本次补充数量入队参数复制，以及离开购物车页面后禁止迟到的结算快照触发导航，两者均有测试覆盖。


## T12 装配更新（2026-09-12）

本工作区已接入 T3＋T4，以上“等待 T12/T4”的段落为原任务交付时记录。正式 commerce 模块使用新 SKU 购物车和公开 addItem，目录徽标订阅同一 store，模块 dispose 释放会话监听。没有把旧 productId 转为 skuId。

T6 仍未交付，因此正式 CommerceCheckout 暂时显示不可用并可返回购物车，旧下单/支付工厂仅保留兼容导出。完整集成范围与验证见 docs/swagger-parallel-tasks.md 的 T12 第二批记录。
