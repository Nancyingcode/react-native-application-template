import {createSimpleModule} from '../helpers';

export const newsModule = createSimpleModule({
  id: 'news',
  route: 'News',
  menuId: 'menu.news',
  homeId: 'home.news',
  titleKey: 'module.news.title',
  eyebrow: 'MARKET INTELLIGENCE',
  title: 'News that moves markets',
  description: 'Editorial feeds and disclosures are normalized before the module renders them.',
  feature: 'news',
  translations: {
    'zh-CN': {'module.news.title': '资讯'},
    'en-US': {'module.news.title': 'News'},
  },
});
