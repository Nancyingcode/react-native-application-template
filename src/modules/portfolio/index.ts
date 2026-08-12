import {createSimpleModule} from '../helpers';

export const portfolioModule = createSimpleModule({
  id: 'portfolio',
  route: 'Portfolio',
  menuId: 'menu.portfolio',
  homeId: 'home.portfolio',
  titleKey: 'module.portfolio.title',
  eyebrow: 'YOUR WEALTH',
  title: 'Portfolio',
  description: 'Positions, balances and performance are composed from normalized account data.',
  feature: 'portfolio',
  permissions: ['portfolio:read'],
  requiresAuth: true,
  translations: {
    'zh-CN': {'module.portfolio.title': '资产'},
    'en-US': {'module.portfolio.title': 'Portfolio'},
  },
});
