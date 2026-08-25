# 埋点服务

埋点底座位于 `src/core/telemetry.ts`，默认通过
`POST {apiBaseUrl}/v1/analytics/events` 批量上报。服务不依赖第三方 SDK；如需接入
Segment、Amplitude、神策等平台，只需实现 `AnalyticsTransport`，业务调用无需调整。

## 采集范围

获得用户同意后，应用会自动采集以下通用事件：

- `app_open`、`app_foreground`、`app_background`、`app_close`：应用生命周期和前台停留时长；
- `screen` 类型事件：初始页面及每次路由切换；
- `http_request`：接口路径（自动移除查询参数）、方法、状态码、耗时、重试次数和数据来源；
- `app_error`、`performance_measure`：现有监控服务捕获的错误和异步操作耗时；
- `identify` 类型事件：会话建立后自动关联用户，退出登录时重置会话标识。

密码、Token、Cookie、银行卡、账号、邮箱、手机号和身份信息等字段会在任意嵌套层级被替换为
`[REDACTED]`。自定义属性仍应遵守数据最小化原则，不应上报不必要的个人信息。

## 同意与自定义上报

埋点默认关闭。隐私授权通过后启用，撤回授权会立即停止采集并清空尚未发送的队列：

```ts
services.analytics.setConsent(true);
services.analytics.setConsent(false);
```

业务事件使用稳定的 snake_case 名称，属性使用可序列化数据：

```ts
services.analytics.track('order_submitted', {
  symbol: '0700.HK',
  side: 'buy',
  orderType: 'limit',
});

services.analytics.screen('OrderDetail', {source: 'portfolio'});
services.analytics.identify(user.id, {membershipTier: user.tier});
await services.analytics.flush();
```

`track` 和 `screen` 不阻塞 UI。默认每 20 条或 15 秒发送一次；进入后台时立即刷新。
发送失败的批次会回到内存队列，后续刷新继续重试，队列最多保留 500 条。

## 上报格式

格式兼容主流 CDP/产品分析平台常用字段：

```json
{
  "sentAt": "2026-08-25T01:02:04.000Z",
  "batch": [
    {
      "schemaVersion": 1,
      "messageId": "event-id",
      "type": "track",
      "event": "order_submitted",
      "timestamp": "2026-08-25T01:02:03.000Z",
      "anonymousId": "anonymous-id",
      "userId": "user-id",
      "context": {
        "app": {"id": "aurora", "name": "Aurora Invest", "version": "1.0.0"},
        "device": {"platform": "android", "osVersion": "36"},
        "locale": "zh-CN",
        "timezone": "Asia/Hong_Kong",
        "channel": {"id": "direct", "campaign": "organic"},
        "sessionId": "session-id"
      },
      "properties": {"symbol": "0700.HK", "side": "buy"}
    }
  ]
}
```

服务端应以 `messageId` 幂等去重，并返回任意 2xx 状态。非 2xx、超时或网络异常均视为失败。
