import { createSimpleModule } from '../helpers';

export const tradingModule = createSimpleModule({
  id: 'trading',
  route: 'Trading',
  menuId: 'menu.trading',
  homeId: 'home.trading',
  titleKey: 'module.trading.title',
  eyebrowKey: 'module.trading.eyebrow',
  screenTitleKey: 'module.trading.screenTitle',
  descriptionKey: 'module.trading.description',
  actionKey: 'module.trading.action',
  feature: 'trading',
  permissions: ['trade:write'],
  requiresAuth: true,
  translations: {
    'zh-CN': {
      'module.trading.title': '交易',
      'module.trading.eyebrow': '订单交易',
      'module.trading.screenTitle': '安心交易',
      'module.trading.description':
        '所有订单共用统一校验规则，券商特有字段由交易适配器负责转换。',
      'module.trading.action': '创建订单',
    },
    'en-US': {
      'module.trading.title': 'Trade',
      'module.trading.eyebrow': 'ORDER ENTRY',
      'module.trading.screenTitle': 'Trade with confidence',
      'module.trading.description':
        'Order validation is shared; broker-specific payloads are translated behind a trading adapter.',
      'module.trading.action': 'Create order',
    },
  },
});
