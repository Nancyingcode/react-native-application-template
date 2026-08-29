import { createSimpleModule } from '../helpers';

export const portfolioModule = createSimpleModule({
  id: 'portfolio',
  route: 'Portfolio',
  menuId: 'menu.portfolio',
  homeId: 'home.portfolio',
  titleKey: 'module.portfolio.title',
  eyebrowKey: 'module.portfolio.eyebrow',
  screenTitleKey: 'module.portfolio.screenTitle',
  descriptionKey: 'module.portfolio.description',
  feature: 'portfolio',
  permissions: ['portfolio:read'],
  requiresAuth: true,
  translations: {
    'zh-CN': {
      'module.portfolio.title': '资产',
      'module.portfolio.eyebrow': '你的财富',
      'module.portfolio.screenTitle': '资产组合',
      'module.portfolio.description':
        '持仓、余额与收益表现均基于标准化账户数据统一呈现。',
    },
    'en-US': {
      'module.portfolio.title': 'Portfolio',
      'module.portfolio.eyebrow': 'YOUR WEALTH',
      'module.portfolio.screenTitle': 'Portfolio',
      'module.portfolio.description':
        'Positions, balances and performance are composed from normalized account data.',
    },
  },
});
