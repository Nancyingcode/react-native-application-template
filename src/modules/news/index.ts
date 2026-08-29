import { createSimpleModule } from '../helpers';

export const newsModule = createSimpleModule({
  id: 'news',
  route: 'News',
  menuId: 'menu.news',
  homeId: 'home.news',
  titleKey: 'module.news.title',
  eyebrowKey: 'module.news.eyebrow',
  screenTitleKey: 'module.news.screenTitle',
  descriptionKey: 'module.news.description',
  feature: 'news',
  translations: {
    'zh-CN': {
      'module.news.title': '资讯',
      'module.news.eyebrow': '市场情报',
      'module.news.screenTitle': '洞察市场动向',
      'module.news.description':
        '编辑资讯与披露信息会先经过标准化处理，再由模块统一呈现。',
    },
    'en-US': {
      'module.news.title': 'News',
      'module.news.eyebrow': 'MARKET INTELLIGENCE',
      'module.news.screenTitle': 'News that moves markets',
      'module.news.description':
        'Editorial feeds and disclosures are normalized before the module renders them.',
    },
  },
});
