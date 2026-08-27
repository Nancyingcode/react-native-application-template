# 埋点后台对接协议

本文档描述 React Native 客户端当前实际发送的埋点协议，供采集网关、数据平台和业务后台对接。

## 1. 接口概览

| 项目 | 约定 |
| --- | --- |
| Method | `POST` |
| Path | `/v1/analytics/events` |
| 完整地址 | `{apiBaseUrl}/v1/analytics/events` |
| Content-Type | `application/json` |
| Accept | `application/json` |
| 鉴权头 | `X-Analytics-Key: <key>`，生产环境配置有效 Key 时携带 |
| 单批数量 | `1～20` 条 |
| 成功条件 | 任意 HTTP `2xx` |
| 失败条件 | 非 `2xx`、超时或网络异常，客户端会将整批数据重新入队 |
| 超时时间 | 与当前品牌环境的 API 超时时间一致 |

请求体：

```json
{
  "sentAt": "2026-08-25T01:02:04.000Z",
  "batch": [
    {
      "schemaVersion": 1,
      "messageId": "mep26jf0-k8g4h3q2wx",
      "type": "track",
      "event": "app_open",
      "timestamp": "2026-08-25T01:02:03.000Z",
      "anonymousId": "mep26jd1-vf3w8p9k2z",
      "context": {
        "app": {
          "id": "aurora",
          "name": "Aurora Invest",
          "version": "1.0.0"
        },
        "device": {
          "platform": "android",
          "osVersion": "36"
        },
        "locale": "zh-CN",
        "timezone": "Asia/Hong_Kong",
        "channel": {
          "id": "direct",
          "campaign": "organic"
        },
        "sessionId": "mep26jd2-5pd7q1r8az"
      },
      "properties": {
        "initialState": "active"
      }
    }
  ]
}
```

所有事件都受用户授权控制。授权前产生的数据不会缓存或补发，因此首次授权发生在 App 启动之后时，后台可能收不到本次启动的 `app_open` 或首次 screen 事件；`analytics_consent_granted` 是授权后进入队列的第一条事件。

客户端当前不读取响应体，后台只需返回 `2xx`。建议成功持久化整批数据后返回：

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{"accepted": 1}
```

## 2. 批量请求字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sentAt` | ISO 8601 字符串 | 是 | 客户端开始发送本批数据的 UTC 时间，不等于事件发生时间 |
| `batch` | `AnalyticsEvent[]` | 是 | 事件数组，当前每次最多 20 条 |

## 3. 所有事件的公共字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `schemaVersion` | 数字 | 是 | 当前固定为 `1` |
| `messageId` | 字符串 | 是 | 单事件唯一 ID；后台应以此字段幂等去重，不要解析其内部格式 |
| `type` | 枚举 | 是 | `track`、`screen` 或 `identify` |
| `timestamp` | ISO 8601 字符串 | 是 | 事件在客户端发生的 UTC 时间 |
| `anonymousId` | 字符串 | 是 | 本次客户端进程内的匿名标识 |
| `userId` | 字符串 | 否 | 建立登录会话并完成 identify 后存在 |
| `context` | 对象 | 是 | 应用、设备、地区、渠道和会话上下文 |
| `event` | 字符串 | 条件必填 | `type=track` 时必填 |
| `name` | 字符串 | 条件必填 | `type=screen` 时必填 |
| `properties` | 对象 | 条件必填 | `track`、`screen` 事件属性 |
| `traits` | 对象 | 条件必填 | `type=identify` 时的用户属性 |

事件名称规则为 `^[a-zA-Z][a-zA-Z0-9_.-]{0,99}$`。当前内置 track 事件均使用 snake_case。

### 3.1 context 格式

| 字段 | 类型 | 必填 | 示例/说明 |
| --- | --- | --- | --- |
| `context.app.id` | 字符串 | 是 | 品牌 ID，例如 `aurora` |
| `context.app.name` | 字符串 | 是 | App 名称，例如 `Aurora Invest` |
| `context.app.version` | 字符串 | 是 | 客户端版本，例如 `1.0.0` |
| `context.device.platform` | 字符串 | 是 | 当前移动端为 `android` 或 `ios` |
| `context.device.osVersion` | 字符串 | 是 | 系统版本，统一按字符串接收 |
| `context.locale` | 字符串 | 是 | 客户端默认语言，例如 `zh-CN` |
| `context.timezone` | 字符串 | 是 | IANA 时区，例如 `Asia/Hong_Kong`；无法获取时为 `unknown` |
| `context.channel.id` | 字符串 | 是 | 安装/分发渠道 ID |
| `context.channel.campaign` | 字符串 | 否 | 活动 ID，例如 `organic` |
| `context.sessionId` | 字符串 | 是 | 埋点会话 ID；用户退出登录后会生成新值 |

## 4. 按顶层类型分类

### 4.1 事件总表

| 顶层类型 | 业务分类 | `event`/`name` | 主要载荷 |
| --- | --- | --- | --- |
| `track` | 授权 | `analytics_consent_granted` | `{}` |
| `track` | 生命周期 | `app_open` | `initialState` |
| `track` | 生命周期 | `app_foreground` | `previousState` |
| `track` | 生命周期 | `app_background` | `engagementTimeMs` |
| `track` | 生命周期 | `app_close` | `engagementTimeMs` |
| `track` | HTTP 指标 | `http_request` | 路径、方法、状态、耗时、来源、尝试次数、错误码 |
| `track` | 错误 | `app_error` | 错误名、错误消息和动态上下文 |
| `track` | 性能 | `performance_measure` | 操作名、耗时、成功状态 |
| `track` | 模块操作 | `module_action` | 标题 |
| `track` | 扫码登录 | `qr_login_scanned` | 是否含有效期 |
| `track` | 扫码登录 | `qr_login_rejected` | 拒绝原因 |
| `track` | 扫码登录 | `qr_login_confirmed` | `{}` |
| `track` | 扫码登录 | `qr_login_rejected_by_user` | `{}` |
| `track` | 自定义业务 | 自定义 snake_case | 自定义 `properties` |
| `screen` | 页面浏览 | 路由名，例如 `Home`、`Portfolio` | `titleKey` |
| `identify` | 用户关联 | 无 | `userId`、`traits` |

### 4.2 track：行为、生命周期、性能和错误事件

格式：

```json
{
  "schemaVersion": 1,
  "messageId": "event-id",
  "type": "track",
  "event": "event_name",
  "timestamp": "2026-08-25T01:02:03.000Z",
  "anonymousId": "anonymous-id",
  "userId": "user-id",
  "context": {},
  "properties": {}
}
```

`userId` 为可选字段，其他示例中省略的公共字段仍按第 3 节发送。

### 4.3 screen：页面浏览事件

格式：

```json
{
  "schemaVersion": 1,
  "messageId": "event-id",
  "type": "screen",
  "name": "Portfolio",
  "timestamp": "2026-08-25T01:02:03.000Z",
  "anonymousId": "anonymous-id",
  "userId": "user-id",
  "context": {},
  "properties": {
    "titleKey": "portfolio.title"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | 字符串 | 是 | 当前路由名称；首页为 `Home`，其他值来自模块路由 |
| `properties.titleKey` | 字符串 | 否 | 页面标题的国际化 Key；首页或无标题路由可能不存在 |

页面首次渲染和后续每次路由切换都会产生一条 screen 事件。

### 4.4 identify：用户关联事件

格式：

```json
{
  "schemaVersion": 1,
  "messageId": "event-id",
  "type": "identify",
  "timestamp": "2026-08-25T01:02:03.000Z",
  "anonymousId": "anonymous-id",
  "userId": "user-123",
  "context": {},
  "traits": {
    "membershipTier": "gold"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `userId` | 字符串 | 是 | 业务用户 ID，后台按不透明字符串处理 |
| `traits` | 对象 | 是 | 用户属性；自动会话关联时当前发送空对象 `{}` |

客户端成功写入登录 Session 后自动发送 identify；退出登录只重置本地关联，不额外发送事件。

## 5. track 自动事件清单

### 5.1 授权事件

#### analytics_consent_granted

用户允许埋点采集时产生。

```json
{
  "type": "track",
  "event": "analytics_consent_granted",
  "properties": {}
}
```

### 5.2 应用生命周期事件

#### app_open

```json
{
  "type": "track",
  "event": "app_open",
  "properties": {
    "initialState": "active"
  }
}
```

| 属性 | 类型 | 必填 | 枚举/说明 |
| --- | --- | --- | --- |
| `initialState` | 字符串 | 是 | React Native AppState：`active`、`background`、`inactive`、`unknown` 或 `extension` |

#### app_foreground

```json
{
  "type": "track",
  "event": "app_foreground",
  "properties": {
    "previousState": "background"
  }
}
```

| 属性 | 类型 | 必填 | 枚举/说明 |
| --- | --- | --- | --- |
| `previousState` | 字符串 | 是 | 进入前台前的 AppState |

#### app_background

```json
{
  "type": "track",
  "event": "app_background",
  "properties": {
    "engagementTimeMs": 82543
  }
}
```

#### app_close

```json
{
  "type": "track",
  "event": "app_close",
  "properties": {
    "engagementTimeMs": 82543
  }
}
```

`app_background` 和 `app_close` 的属性相同：

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `engagementTimeMs` | 非负整数 | 是 | 本次连续前台停留时长，单位毫秒 |

移动系统可能直接终止进程，因此后台不能假设每次 `app_open` 都一定对应一条 `app_close`。会话分析应优先结合 `sessionId`、`timestamp` 和超时规则计算。

### 5.3 HTTP 指标事件

#### http_request

网络成功示例：

```json
{
  "type": "track",
  "event": "http_request",
  "properties": {
    "path": "/v1/portfolio",
    "method": "GET",
    "status": 200,
    "durationMs": 184,
    "success": true,
    "source": "network",
    "attempts": 1
  }
}
```

鉴权前失败示例：

```json
{
  "type": "track",
  "event": "http_request",
  "properties": {
    "path": "/v1/portfolio",
    "method": "GET",
    "durationMs": 2,
    "success": false,
    "source": "client",
    "attempts": 0,
    "errorCode": "AUTHENTICATION_REQUIRED"
  }
}
```

| 属性 | 类型 | 必填 | 枚举/说明 |
| --- | --- | --- | --- |
| `path` | 字符串 | 是 | API 路径，查询参数已移除，不包含域名 |
| `method` | 字符串 | 是 | 大写 HTTP 方法，例如 `GET`、`POST` |
| `status` | 整数 | 否 | 收到 HTTP 响应时存在；网络错误、超时、客户端拦截时可能没有 |
| `durationMs` | 非负整数 | 是 | 从请求开始到最终成功/失败的总耗时，包含重试和缓存查询 |
| `success` | 布尔值 | 是 | 请求最终是否成功 |
| `source` | 枚举 | 是 | `network`、`cache`、`client` |
| `attempts` | 非负整数 | 是 | 实际网络尝试次数；缓存命中和客户端拦截为 `0` |
| `errorCode` | 字符串 | 否 | 业务 API 错误码、Error 名称、`AUTHENTICATION_REQUIRED` 或 `UNKNOWN_ERROR` |

`source` 语义：

- `network`：实际发起了网络请求；
- `cache`：TTL 缓存直接命中，`status` 不存在且 `attempts=0`；
- `client`：发送前被客户端阻止，当前场景为缺少有效登录会话。

### 5.4 错误事件

#### app_error

```json
{
  "type": "track",
  "event": "app_error",
  "properties": {
    "errorName": "ApiError",
    "errorMessage": "Request failed with 500",
    "operation": "qr-login-confirm",
    "screen": "qr-login"
  }
}
```

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `errorName` | 字符串 | 是 | JavaScript Error 名称；非 Error 值为 `UnknownError` |
| `errorMessage` | 字符串 | 是 | 错误消息 |
| 其他上下文字段 | JSON 值 | 否 | 调用监控服务时传入，例如 `operation`、`screen` |

后台应对 `errorMessage` 再做长度限制和内容脱敏，因为客户端按字段名脱敏，不扫描字符串内容中的个人信息。

### 5.5 性能事件

#### performance_measure

```json
{
  "type": "track",
  "event": "performance_measure",
  "properties": {
    "operation": "load_portfolio",
    "durationMs": 342,
    "success": true
  }
}
```

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `operation` | 字符串 | 是 | 被测异步操作的稳定名称 |
| `durationMs` | 非负整数 | 是 | 操作耗时，单位毫秒 |
| `success` | 布尔值 | 是 | 操作是否成功 |

操作失败时通常还会产生一条相同 `operation` 的 `app_error`。

## 6. track 业务事件清单

### 6.1 通用模块操作

#### module_action

```json
{
  "type": "track",
  "event": "module_action",
  "properties": {
    "title": "Place order"
  }
}
```

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `title` | 字符串 | 是 | 当前模块操作按钮对应的页面标题 |

### 6.2 扫码登录

#### qr_login_scanned

```json
{
  "type": "track",
  "event": "qr_login_scanned",
  "properties": {
    "hasExpiry": true
  }
}
```

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `hasExpiry` | 布尔值 | 是 | 当前固定为 `true`，表示服务端返回并校验了有效期 |

不会上传二维码 challenge、设备名、位置或原始二维码内容。

#### qr_login_rejected

```json
{
  "type": "track",
  "event": "qr_login_rejected",
  "properties": {
    "reason": "invalid-challenge"
  }
}
```

| 属性 | 类型 | 必填 | 枚举 |
| --- | --- | --- | --- |
| `reason` | 字符串 | 是 | `empty`、`too-long`、`unsupported-source`、`invalid-challenge`、`expired`、`unknown` |

#### qr_login_confirmed

```json
{
  "type": "track",
  "event": "qr_login_confirmed",
  "properties": {}
}
```

#### qr_login_rejected_by_user

```json
{
  "type": "track",
  "event": "qr_login_rejected_by_user",
  "properties": {}
}
```

## 7. 自定义事件格式

新增业务事件统一使用 `track`，事件名使用稳定的 snake_case，禁止把动态 ID 放进事件名。

```json
{
  "type": "track",
  "event": "order_submitted",
  "properties": {
    "symbol": "0700.HK",
    "side": "buy",
    "orderType": "limit",
    "quantity": 100,
    "currency": "HKD"
  }
}
```

建议约束：

- 属性名使用 camelCase；
- 金额使用最小货币单位整数，或同时携带明确的 `currency`，避免浮点歧义；
- 时间使用 ISO 8601 UTC 字符串，时长统一使用 `*Ms` 毫秒整数；
- 枚举传稳定英文代码，不传展示文案；
- 不上传 Token、密码、完整银行卡号、证件号、手机号、邮箱、二维码原文等敏感数据；
- 对已有事件新增可选字段可以向后兼容，删除字段、改变类型或改变语义需要升级 `schemaVersion`。

## 8. 脱敏规则

客户端递归检查 `context`、`properties` 和 `traits` 的字段名。字段名匹配以下任一关键字时，值替换为 `[REDACTED]`：

```text
authorization, cookie, password, secret, token,
account, card, email, phone, mobile, identity
```

匹配不区分大小写，例如：

```json
{
  "accessToken": "[REDACTED]",
  "profile": {
    "emailAddress": "[REDACTED]"
  }
}
```

`userId` 是协议明确允许的身份关联字段，不适用上述替换。后台仍应建立字段白名单、长度限制和二次脱敏，不能只依赖客户端规则。

## 9. 后台接收与存储建议

### 9.1 校验与幂等

1. 校验请求体、`schemaVersion`、顶层 `type` 和条件必填字段。
2. 使用 `(messageId)` 唯一索引幂等去重；重复事件按成功处理。
3. 先持久化整批数据或写入可靠消息队列，再返回 `2xx`。
4. 事件消费顺序以 `timestamp` 为准，不依赖 HTTP 到达顺序。
5. 保留服务端 `receivedAt`，用于计算上传延迟和排查客户端时钟偏差。

客户端当前忽略响应体，并把任意非 `2xx` 视为整批失败。因此不建议通过响应体表达“部分成功”；单条坏数据可进入隔离队列，同时对已可靠接收的批次返回 `202`。

### 9.2 推荐原始表字段

| 字段 | 建议类型 | 来源 |
| --- | --- | --- |
| `message_id` | varchar，唯一索引 | `messageId` |
| `schema_version` | integer | `schemaVersion` |
| `event_type` | varchar | `type` |
| `event_name` | varchar | track 的 `event` 或 screen 的 `name`；identify 可为 `NULL` |
| `event_at` | timestamp with time zone | `timestamp` |
| `received_at` | timestamp with time zone | 服务端生成 |
| `sent_at` | timestamp with time zone | 批次 `sentAt` |
| `anonymous_id` | varchar | `anonymousId` |
| `user_id` | varchar，可空 | `userId` |
| `session_id` | varchar | `context.sessionId` |
| `app_id` | varchar | `context.app.id` |
| `app_version` | varchar | `context.app.version` |
| `platform` | varchar | `context.device.platform` |
| `channel_id` | varchar | `context.channel.id` |
| `context` | JSON/JSONB | 完整 `context` |
| `payload` | JSON/JSONB | `properties` 或 `traits` |

建议先保存不可变原始事件，再通过流处理或离线任务生成页面浏览、用户会话、HTTP 指标、错误和业务漏斗主题表。

## 10. 后台类型定义参考

```ts
type JsonObject = Record<string, unknown>;
type EventType = 'track' | 'screen' | 'identify';

interface BatchRequest {
  sentAt: string;
  batch: AnalyticsEvent[];
}

interface BaseEvent {
  schemaVersion: 1;
  messageId: string;
  type: EventType;
  timestamp: string;
  anonymousId: string;
  userId?: string;
  context: {
    app: {id: string; name: string; version: string};
    device: {platform: string; osVersion: string};
    locale: string;
    timezone: string;
    channel: {id: string; campaign?: string};
    sessionId: string;
  };
}

interface TrackEvent extends BaseEvent {
  type: 'track';
  event: string;
  properties: JsonObject;
}

interface ScreenEvent extends BaseEvent {
  type: 'screen';
  name: string;
  properties: JsonObject;
}

interface IdentifyEvent extends BaseEvent {
  type: 'identify';
  userId: string;
  traits: JsonObject;
}

type AnalyticsEvent = TrackEvent | ScreenEvent | IdentifyEvent;
```

## 11. 联调验收清单

- 相同 `messageId` 重复发送不会产生重复数据；
- 同一个 batch 混合 `track`、`screen`、`identify` 时可以正确入库；
- identify 之前的匿名事件允许没有 `userId`；
- `status`、`errorCode`、`campaign`、`titleKey` 等可选字段缺失时不会拒绝事件；
- 能接收 `properties={}` 和 `traits={}`；
- 时间字段按带时区的 ISO 8601 解析；
- 非 `2xx` 时客户端重试不会导致重复数据；
- 超长错误消息和未知自定义属性不会影响整批接收；
- 日志不会输出完整 `X-Analytics-Key` 或未脱敏事件正文。
