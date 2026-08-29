import { createSimpleModule } from '../helpers';

export const marketsModule = createSimpleModule({
  id: 'markets',
  route: 'Markets',
  menuId: 'menu.markets',
  homeId: 'home.markets',
  titleKey: 'module.markets.title',
  eyebrowKey: 'module.markets.eyebrow',
  screenTitleKey: 'module.markets.screenTitle',
  descriptionKey: 'module.markets.description',
  feature: 'markets',
  translations: {
    'zh-CN': {
      'module.markets.title': '行情',
      'module.markets.eyebrow': '实时市场',
      'module.markets.screenTitle': '市场概览',
      'module.markets.description':
        '自选列表、报价与市场深度共享统一数据协议，行情供应商可通过适配器灵活替换。',
    },
    'en-US': {
      'module.markets.title': 'Markets',
      'module.markets.eyebrow': 'LIVE MARKETS',
      'module.markets.screenTitle': 'Markets at a glance',
      'module.markets.description':
        'Watchlists, quotes and market depth share one data contract while vendors remain replaceable adapters.',
    },
  },
});
