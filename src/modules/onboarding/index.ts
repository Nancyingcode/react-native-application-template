import { createSimpleModule } from '../helpers';

export const onboardingModule = createSimpleModule({
  id: 'onboarding',
  route: 'AccountOpening',
  menuId: 'menu.onboarding',
  homeId: 'home.onboarding',
  titleKey: 'module.onboarding.title',
  eyebrowKey: 'module.onboarding.eyebrow',
  screenTitleKey: 'module.onboarding.screenTitle',
  descriptionKey: 'module.onboarding.description',
  actionKey: 'module.onboarding.action',
  feature: 'accountOpening',
  translations: {
    'zh-CN': {
      'module.onboarding.title': '开户',
      'module.onboarding.eyebrow': '线上开户',
      'module.onboarding.screenTitle': '开立账户',
      'module.onboarding.description':
        '身份核验步骤由策略按需选择，增强尽调不会把品牌特例带入公共页面。',
      'module.onboarding.action': '开始申请',
    },
    'en-US': {
      'module.onboarding.title': 'Open account',
      'module.onboarding.eyebrow': 'DIGITAL ONBOARDING',
      'module.onboarding.screenTitle': 'Open an account',
      'module.onboarding.description':
        'KYC steps are selected through a strategy, so enhanced due diligence never leaks brand checks into shared screens.',
      'module.onboarding.action': 'Start application',
    },
  },
});
