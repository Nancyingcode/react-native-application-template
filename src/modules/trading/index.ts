import {createSimpleModule} from '../helpers';

export const tradingModule = createSimpleModule({
  id: 'trading',
  route: 'Trading',
  menuId: 'menu.trading',
  homeId: 'home.trading',
  titleKey: 'module.trading.title',
  eyebrow: 'ORDER ENTRY',
  title: 'Trade with confidence',
  description: 'Order validation is shared; broker-specific payloads are translated behind a trading adapter.',
  action: 'Create order',
  feature: 'trading',
  permissions: ['trade:write'],
  requiresAuth: true,
  translations: {
    'zh-CN': {'module.trading.title': '交易'},
    'en-US': {'module.trading.title': 'Trade'},
  },
});
