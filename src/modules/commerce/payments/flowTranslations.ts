export const paymentFlowTranslations = {
  'zh-CN': {
    'commerce.payment.v2.title': '订单支付',
    'commerce.payment.v2.intro':
      '支付结果以服务端查询为准。返回应用不会自动代表支付完成。',
    'commerce.payment.v2.order': '订单编号',
    'commerce.payment.v2.payment': '支付单编号',
    'commerce.payment.v2.result': '支付状态',
    'commerce.payment.v2.loading': '正在处理',
    'commerce.payment.v2.notCreated': '尚未读取支付单',
    'commerce.payment.v2.creating': '正在读取支付单…',
    'commerce.payment.v2.checking': '正在核实支付结果…',
    'commerce.payment.v2.success': '支付成功',
    'commerce.payment.v2.pending': '等待支付结果',
    'commerce.payment.v2.expired': '支付单已过期',
    'commerce.payment.v2.failed': '支付失败',
    'commerce.payment.v2.unconfirmed': '结果尚未确认',
    'commerce.payment.v2.amountUnknown':
      '金额信息暂不可确认，暂不展示应付金额。',
    'commerce.payment.v2.provider': '支付渠道',
    'commerce.payment.v2.WECHAT_PAY': '微信支付',
    'commerce.payment.v2.ALIPAY': '支付宝',
    'commerce.payment.v2.noProvider': '当前品牌尚未配置支付渠道。',
    'commerce.payment.v2.launchBlocked':
      '当前暂不支持在应用内完成付款。你仍可以查看支付单并查询付款结果。',
    'commerce.payment.v2.create': '读取支付单',
    'commerce.payment.v2.retryCreate': '使用原操作重试',
    'commerce.payment.v2.check': '查询支付结果',
    'commerce.payment.v2.orders': '返回订单列表',
    'commerce.payment.v2.unknown':
      '创建结果未知。请勿重复付款；重试将继续查询同一次创建操作。',
    'commerce.payment.v2.queryFailed':
      '查询失败，当前结果未确认，请稍后再次查询。',
    'commerce.payment.v2.session':
      '账号状态已变化，请从当前账号的订单列表重新进入。',
    'commerce.payment.v2.invalidOrder':
      '缺少有效订单编号，请从订单列表重新进入。',
    'commerce.payment.v2.unavailable':
      '无法访问此订单或支付单，请返回订单列表核实。',
    'commerce.payment.v2.expiredOrder': '订单已过期，请返回订单列表查看。',
    'commerce.payment.v2.paidOrder':
      '服务端提示订单已支付，请返回订单详情核实。',
    'commerce.payment.v2.cancelledOrder': '订单已取消，请返回订单列表查看。',
    'commerce.payment.v2.conflict':
      '操作存在冲突或仍在处理中。请先核实订单状态，不要重复付款。',
    'commerce.payment.v2.invalidRequest':
      '服务端未接受此次请求，请返回订单列表核实。',
  },
  'en-US': {
    'commerce.payment.v2.title': 'Order payment',
    'commerce.payment.v2.intro':
      'Payment is confirmed by the server. Returning to the app does not mean payment is complete.',
    'commerce.payment.v2.order': 'Order ID',
    'commerce.payment.v2.payment': 'Payment ID',
    'commerce.payment.v2.result': 'Payment status',
    'commerce.payment.v2.loading': 'Processing',
    'commerce.payment.v2.notCreated': 'Payment not loaded',
    'commerce.payment.v2.creating': 'Preparing payment…',
    'commerce.payment.v2.checking': 'Checking payment result…',
    'commerce.payment.v2.success': 'Payment successful',
    'commerce.payment.v2.pending': 'Awaiting payment result',
    'commerce.payment.v2.expired': 'Payment expired',
    'commerce.payment.v2.failed': 'Payment failed',
    'commerce.payment.v2.unconfirmed': 'Result unconfirmed',
    'commerce.payment.v2.amountUnknown':
      'The amount cannot be confirmed yet and is not displayed.',
    'commerce.payment.v2.provider': 'Payment provider',
    'commerce.payment.v2.WECHAT_PAY': 'WeChat Pay',
    'commerce.payment.v2.ALIPAY': 'Alipay',
    'commerce.payment.v2.noProvider':
      'No payment provider is configured for this brand.',
    'commerce.payment.v2.launchBlocked':
      'In-app payment is currently unavailable. You can still view the payment and check its result.',
    'commerce.payment.v2.create': 'Load payment',
    'commerce.payment.v2.retryCreate': 'Retry original operation',
    'commerce.payment.v2.check': 'Check payment result',
    'commerce.payment.v2.orders': 'Back to orders',
    'commerce.payment.v2.unknown':
      'Creation result is unknown. Do not pay again; retry will resume the original operation.',
    'commerce.payment.v2.queryFailed':
      'Query failed. The current result is unconfirmed; check again later.',
    'commerce.payment.v2.session':
      'Your session changed. Reopen payment from the current account’s orders.',
    'commerce.payment.v2.invalidOrder':
      'A valid order ID is required. Reopen from orders.',
    'commerce.payment.v2.unavailable':
      'This order or payment is unavailable. Check your orders.',
    'commerce.payment.v2.expiredOrder':
      'The order has expired. Check your orders.',
    'commerce.payment.v2.paidOrder':
      'The server reports this order is paid. Verify in order details.',
    'commerce.payment.v2.cancelledOrder':
      'The order was cancelled. Check your orders.',
    'commerce.payment.v2.conflict':
      'The operation conflicts or is still processing. Verify the order before any further payment.',
    'commerce.payment.v2.invalidRequest':
      'The server rejected this request. Check your orders.',
  },
};
