# 新 Swagger 移动端对接：低冲突并行任务清单

核对时间：2026-09-08。来源：http://localhost:3000/docs/ 的 swagger-ui-init.js 内嵌 OpenAPI，标题 Mobile Mall Backend API，版本 1.0。共 83 个 HTTP 操作，其中 21 个 /admin/ 操作。本次快照保存在 artifacts/swagger-latest.json（忽略目录）；版本号未体现接口增量，实施前应保存同一份契约快照供所有任务使用。

本清单规划当前 React Native 客户端的实现和对接；T0 已完成保持行为不变的代码提取，其余业务任务尚未启动，未提交、推送或创建任务。现有登录、注册、Token 刷新、个人资料、商品列表/详情已有接入，保留并回归。docs/api-integration.md 的 13 接口基线已过时，不应继续据此认定缺少下单、SKU、短信等接口。

## 执行方式：一个前置任务 + 十一个业务任务 + 一个集成任务

不要按“接口层一人、页面一人”横向拆分；每个业务任务拥有自己的类型、repository、Hook、页面、翻译和测试。业务目录是现有 auth/commerce 下的子目录，不新建平行模块体系。实际落点与未来 TypeScript 边界已固定在 [并行契约](./swagger-parallel-contracts.md)，下表及后续任务遵循该契约；未实现业务目录由所属任务按需创建。

T0 先完成并交付同一基线，T1–T11 即可并行开发，存在运行时依赖的任务使用已冻结的接口和模拟实现进行单测。T12 按依赖顺序完成真实装配和联调。每个任务用独立 worktree；不要在同一工作目录同时改文件。目前工作区已有个人资料、品牌配置、ApplicationShell 等未提交修改，建立基线时必须保留，不能覆盖或擅自提交。

| 编号 | 可直接作为任务标题 | 独占代码范围（相对仓库根目录） | 运行依赖 |
| --- | --- | --- | --- |
| T0 | 并行开发准备：拆开商城聚合文件并冻结跨模块契约 | 已提取 catalog/cart/checkout/payments、auth/sms；公共兼容层与 helper 交 T12 | 已完成，先交接同一基线 |
| T1 | 短信登录与服务端退出登录对接 | auth/sms/、auth/logout/；core 会话改动需求交 T12 | T0 |
| T2 | 手机扫码授权适配新二维码协议 | auth/qrLogin.ts、auth/QrLoginScreen.tsx、plugins/qr-login/ | T0 |
| T3 | 商品目录、搜索、SKU 选择与库存展示 | commerce/catalog/；现有 useProducts.ts、catalog.ts | T0；加购依赖 T4 |
| T4 | SKU 服务端购物车与访客购物车衔接 | commerce/cart/；现有 CartStore.ts | T0 |
| T5 | 优惠券账户与领券对接 | commerce/coupons/ | T0 |
| T6 | 收货信息、价格试算与创建订单 | commerce/checkout/ | T0、T4、T5 |
| T7 | 支付单创建、结果查询与开发支付联调 | commerce/payments/；现有 payment.ts | T0；订单来源 T6/T8 |
| T8 | 我的订单、订单详情、取消与确认收货 | commerce/orders/ | T0；支付入口 T7、售后入口 T9 |
| T9 | 退款与售后申请 | commerce/after-sales/ | T0、T8 |
| T10 | 会员、积分账户与站内消息中心 | commerce/account/、commerce/notifications/ | T0 |
| T11 | 秒杀活动、令牌与排队提交 | commerce/seckill/ | T0；复用 T6 收货表单契约 |
| T12 | 路由菜单装配、跨模块联调与最终验收 | 所有聚合入口、品牌配置、app 装配、公共文档与端到端测试 | 分批接入 T1–T11 |

表中 auth/ 和 commerce/ 均位于 src/modules/，plugins/ 位于 src/；每个任务的测试前缀与既有测试归属见并行契约。commerceScreens、commerceRepository、authLogin、authRegister、authRegisterRepository、authSession、http、translations、App、assembleApplication 等总测试归 T12，业务任务另写所属测试，不同时改总测试。T10 如需进一步拆分，应先由 T12 更新所有权表。

## T0：先消除冲突热点

提取前 commerce/screens.tsx 同时定义商品列表、详情、购物车和收银台，repository.ts 混合商品、下单、支付，index.tsx 混合装配与全部翻译。T0 已完成以下实际落点，兼容入口仍保留：

- catalog/screens.tsx、catalog/repository.ts、catalog/types.ts、catalog/translations.ts。
- cart/screen.tsx、cart/types.ts、cart/translations.ts；CartStore.ts 保持原位置与行为。
- checkout/screen.tsx、checkout/repository.ts、checkout/types.ts、checkout/translations.ts。
- payments/repository.ts、payments/types.ts、payments/translations.ts、payments/useCheckoutPayment.ts；payment.ts 保持原位置。
- commerce/shared/ui.tsx 仅有真实复用控件，shared/idempotency.ts 保留旧请求共用生成函数。
- auth/sms/PhoneLoginScreen.tsx、sms/translations.ts、auth/shared/form.tsx、auth/authResponse.ts。

下列条款是本次冻结的边界，未来定义详见并行契约：

1. 仅按已有职责提取页面、repository 和对应翻译到上表目录，保留现有导出兼容层，不改变业务行为。auth/AuthMethodScreens.tsx 中提取 PhoneLoginScreen，其他认证页面保持原样。共享 UI 只提取实际被多个区域使用的控件。
2. 冻结共享契约：SKU 选择结果 skuId/quantity；购物车条目 ID 与 skuId 的区别；结算 items/couponId/shippingAddress；成功下单只向支付传 orderId；订单详情只向售后传 orderId/orderItemId/quantity；跨屏只传必要 ID，目标页面重新取权威数据。
3. ShippingAddress 类型与表单输入/输出已在契约中定义，实现归 T6 的 checkout/shippingAddress.ts 与 checkout/ShippingAddressForm.tsx，T11 只引用。Order/Payment 私有 DTO 留在所属目录；未来金额规则和跨业务边界暂存文档，不在 commerce/shared/ 放无调用方抽象。实际公共代码归 T12。
4. 复用 HttpClient 和 SessionManager；先确认现有 headers、401 刷新、错误处理能力，不创建第二个 HTTP 客户端。需要的公共基础能力由 T0 统一修改。抽出可复用的认证响应校验，供短信登录复用。
5. 冻结 T4 待实现的访客购物车方案：真实 SKU、本地访客购物车、登录后显式确认合并，不能自动重放累加型加购。合并进度和失败恢复由 T4 负责，不能静默丢弃访客内容。这是客户端契约，并非 Swagger 已规定行为；T0 未迁移旧 productId 购物车或改变登录后行为。
6. T0 结束后，公共文件交由 T12 独占。任何业务任务需要修改公共契约，只提交变更请求，由同一负责人调整基线。

验收：提取前后行为一致，现有 typecheck/lint/test 和两平台 JS Bundle 通过；记录新导出、路由参数与文件归属。不为拆分重做设计系统。

## T1：短信登录与退出

- 接口：POST /auth/sms/code、/auth/sms/login、/auth/logout（统一前缀 /api/v1）。
- 手机号带国家码，验证码 6 位；重发倒计时读取 resendAfterSeconds 和有效期，不硬编码；短信登录仅登录已有账号，不宣称自动注册。
- 成功使用现有认证响应验证和会话写入；区分验证码错误、短信不可用、限流、账号问题；离页后迟到响应不得登录。
- 退出提交 refreshToken，并按明确策略完成本地清理；测试退出与刷新并发，防止迟到刷新恢复会话。服务端撤销失败不能宣称撤销成功。
- 交付独立退出按钮组件，由 T12 放进个人资料页；不修改 ProfileScreen.tsx、auth/index.tsx。不接找回密码，文档仍无接口。

## T2：扫码授权

- 手机端接口：POST /auth/qr-login/{id}/scan、/confirm、/cancel。
- 新二维码是含 type、sessionId、scanToken 的 JSON；替换旧 resolve/confirm/reject 网关协议，保留现有扫描与授权交互。
- scanToken 是手机凭证，pollToken 是电脑凭证，不能混用或写入日志；固定 expiresAt 不因扫描而延长。处理过期、非本人、非法状态及重复操作。
- POST /auth/qr-login、/{id}/status、/{id}/exchange 属于电脑发起与兑换链路，不在手机里新增一套电脑登录页面；仅作为联调对端使用。
- 新响应没有旧设备描述时使用中性文案，不虚构设备、地点信息。

## T3：商品与搜索

- 接口：GET /products、/products/cursor、/products/{id}、/products/{id}/skus、/skus?productId=、/skus/{id}、/inventory/skus/{skuId}、/search/products、/search/hot。
- 同一列表选择一种分页协议，不重复请求两套接口；SKU 列表两条路径选一个主路径。保留现有商品展示，增加搜索、排序、筛选和规格选择。
- 区分 productId 与 skuId；加购只调用 T4 的公开 addItem(skuId, quantity)，不操作其内部状态。
- 库存接口需要登录，匿名用户不能把请求失败当无库存；库存未知和售罄分别展示。
- 搜索 salePrice 为 number，与商品/SKU Decimal 字符串不同；金额单位核实后再映射，不能简单套用旧模型。覆盖请求竞态、切换筛选、空结果和库存不足。

## T4：购物车

- 接口：GET/DELETE /cart；POST/DELETE /cart/items；PATCH/DELETE /cart/items/{id}；POST /cart/items/select。
- 按服务端条目 ID 更新和删除；SKU 为添加与下单标识。实现选中、批量删除、清空、数量修改、失效条目提示和刷新。
- 服务端 currentPrice、available、valid、invalidReason 为展示依据；本地金额不是下单权威结果。
- 加购会累加数量，网络结果不明时先重新读取，禁止无条件重放；快速修改数量应串行或版本化处理，迟到响应不能覆盖新意图。
- 实现 T0 约定的访客合并与账号隔离；对结算只暴露有效选中 SKU 快照及刷新入口。

## T5：优惠券

- 接口：GET /coupons/my、/coupons/available；POST /coupons/{couponTemplateId}/claim。
- 我的优惠券、状态筛选和领取结果；向 T6 导出独立优惠券选择组件/查询接口，返回用户券实例 couponId。
- couponTemplateId 只用于领取，不能当下单 couponId；领券需要 Idempotency-Key，同一操作重试复用。
- 文档没有可领取模板广场接口：只有真实模板 ID 来源时才提供领券入口，不编造券目录。available 也不等于适用于当前购物车，最终以 T6 试算为准。

## T6：结算与下单

- 接口：POST /pricing/preview、POST /orders。
- 实现单次订单收货信息表单；recipient、phone、province、city、addressLine 必填，district/postalCode 可选。没有地址簿 CRUD，不做假地址管理接口。
- 使用明确的 skuId/quantity 快照试算与下单，避免两次请求之间购物车选中项变化。couponId 为用户优惠券实例。
- 试算请求仅声明 items/couponId，不擅自新增地址入参；运费如何随地址变化需要后端补充契约。
- 创建订单的 Idempotency-Key 放请求头；同一请求重试复用、新订单换新值；结果不明时不创建第二单。统一响应 data 包装，移除此区域旧 /v1/commerce/orders 调用。
- 下单成功保留真实 orderId 并转交 T7；购物车清理由 T4 契约处理，不一律清空未购买条目。校验价格变化、库存不足、券失效和并发冲突。

## T7：支付

- 接口：POST /orders/{orderId}/payments；GET /payments/{id}。/pay 是兼容路径，无需重复接入。
- 替换旧 /v1/commerce/payments 与 /status；使用 payment.id 查询，状态不直接套用现有小写枚举。
- 覆盖创建/复用支付单、回到 App 查询、手动查询、处理中、过期与失败；前台返回不等于支付成功。账号切换或离页后停止旧请求更新。
- 当前 paymentParameters 只声明 provider/paymentNo/expiresAt/mockSuccessPath，未声明微信/支付宝 SDK 或 redirectUrl 参数。真实渠道拉起属于契约阻塞项，不得生成假支付链接。
- MOCK 成功接口只作为开发测试链路；生产页面不得提供模拟成功按钮。支付 callback 是渠道服务端入口，不由 App 调用。

## T8：订单中心

- 接口：GET /orders、/orders/cursor、/orders/{id}；POST /orders/{id}/cancel、/orders/{orderId}/confirm-receipt。
- 实现订单列表、筛选、详情、金额明细和时间线、取消确认与收货确认。筛选参数出现在分页接口，游标接口未声明同类过滤参数，勿自行混用。
- 后端返回订单状态为准；取消只针对待支付订单，取消与支付竞态后重新读详情；确认收货按后端状态限制。
- 支付、售后按钮只导航到 T7/T9，不实现对方请求逻辑。保留订单状态与支付状态的区别，不因本地按钮点击推断服务端完成。
- 文档未提供客户端物流轨迹查询，不虚构物流跟踪页面。

## T9：退款与售后

- 接口：POST /orders/{orderId}/refunds、/orders/{orderId}/after-sales。
- 以 orderItemId 和数量申请，退款金额服务端计算；提交成功显示返回申请编号和状态。
- refund 类型是 REFUND_ONLY/RETURN_AND_REFUND；after-sale 请求类型是 REFUND_ONLY/RETURN_REFUND，不能混用。响应枚举出现 EXCHANGE 不代表创建接口允许换货。
- 退款使用幂等请求头；售后无明确幂等契约，不自动重放结果未知的提交。同一次申请只选一条业务流程，不能同时调用退款和售后制造双申请。
- 用户侧没有申请列表/详情查询和撤销接口，范围限定为提交与本次结果展示；后续进度闭环列为后端补充项。不要调用 admin 审核接口。

## T10：会员、积分和消息

- 接口：GET /members/me、/points/account；POST /points/spend；GET /notifications/cursor、/notifications、/notifications/unread-count；POST /notifications/{id}/read、/notifications/read-all。
- 会员资料、等级权益、积分余额；积分兑换必须有实际业务项目与 sourceId 来源，没有兑换目录/奖励发放契约时只交付 repository 和测试，不提供任意扣积分按钮。
- 消息中心优先游标接口，不用最近 100 条接口冒充分页；实现未读数、单条已读和全部已读。提交失败不能永久本地扣除未读数。
- 账号隔离、重复请求与错误恢复；交付未读徽标组件供 T12 装配，不修改 ApplicationShell。

## T11：秒杀

- 接口：GET /seckill/activities、/activities/{id}、/{activityId}/token；POST /seckill/{activityId}/skus/{skuId}/request。
- 活动列表/详情、时间状态、限购、取令牌与提交；复用 T6 的收货信息组件，不另建一套地址模型。
- 返回 QUEUED/requestId 仅表示入队，不能显示抢购成功或跳转虚构订单。
- 当前没有按 requestId 查询处理结果/关联 orderId 的接口。可完成提交与“排队中”展示；结果闭环明确阻塞，不能仅凭订单列表猜测对应订单。不要把 admin reconciliation 接到 App。

## T12：公共装配与验收

独占 src/modules/auth/index.tsx、auth/repository.ts、auth/authResponse.ts、auth/shared/、src/modules/commerce/index.tsx、保留的 screens.tsx/repository.ts/types.ts 兼容入口、commerce/shared/、src/modules/auth/AuthMethodScreens.tsx、全部个人资料文件、src/core/、src/app/、src/modules/contracts.tsx、src/brand/、brands/、公共配置、docs/api-integration.md、本清单与并行契约，以及契约中列出的总测试。T0 完成后才交接 T12；业务任务发现 core 或公共文件需要变更时向 T12 提交请求。

各业务任务只交付自己的页面导出、translations 和所需路由/菜单清单；T12 统一挂载。优先在已有 auth/commerce 模块注册，避免为每个新功能扩大 ModuleId 或品牌 schema。品牌生成文件只由既有脚本更新。

集成顺序：T1/T2/T10 可独立接入；商城先 T3+T4，再 T5+T6，再 T7+T8，再 T9；T11 先活动浏览/提交，结果闭环等待补充契约。

各任务执行适用的 typecheck、lint 和所属测试；最终统一执行 npm run typecheck、npm run lint、npm test -- --watch=false、npm run bundle:android、npm run bundle:ios。UI 任务阅读 design.md 并执行两品牌、中英文、375/768/1024/1280/1440/1920 宽度及交互状态真实渲染检查。JS Bundle 成功不等于原生或真实支付验收。

## 本轮不派到移动端的接口与缺口

- 21 个 /admin/ 接口：审计、搜索重建、秒杀对账、开关、促销、券模板、后台订单、退款/售后审核及发货，属于独立后台项目。
- /health/live、/health/ready、/version 为运维/诊断能力；当前无对应用户需求，不为覆盖率新增页面。
- /users/{id} 没有现有移动端业务入口，不默认开放任意用户查询。
- 电脑端扫码创建/轮询/兑换属于配套端；支付回调属于服务端；MOCK 成功只用于开发验证。
- 仍缺：找回密码、资料编辑、地址簿、领券模板目录、兑换项目目录、秒杀请求结果查询、用户退款/售后进度查询、物流轨迹、真实支付拉起参数。
- 原 global-rules/AGENTS_condition_rules.md 在本工作区不存在。涉及状态流转的任务开始前应补齐该规则文件；当前清单依据 Swagger 已声明状态，未假设缺失规则内容。

## 每个并行任务共同附加的约束

仅修改分配目录和所属测试；公共文件通过 T12 统一调整。使用 npm，不新增无必要生产依赖，不修改 lock 文件，不擅自 commit/push。接口响应、错误码、鉴权和副作用以冻结 Swagger 为准；契约缺失时输出准确缺口，不猜接口。提交说明列明修改文件、导出 API、路由需求、验证结果及阻塞项；禁止把 mock 通过写成真实联调完成。
