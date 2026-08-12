import {createSimpleModule} from '../helpers';

export const marketsModule = createSimpleModule({
  id: 'markets',
  route: 'Markets',
  menuId: 'menu.markets',
  homeId: 'home.markets',
  titleKey: 'module.markets.title',
  eyebrow: 'LIVE MARKETS',
  title: 'Markets at a glance',
  description: 'Watchlists, quotes and market depth share one data contract while vendors remain replaceable adapters.',
  feature: 'markets',
  translations: {
    'zh-CN': {'module.markets.title': '行情'},
    'en-US': {'module.markets.title': 'Markets'},
  },
});
