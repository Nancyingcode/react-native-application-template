import {createSimpleModule} from '../helpers';

export const onboardingModule = createSimpleModule({
  id: 'onboarding',
  route: 'AccountOpening',
  menuId: 'menu.onboarding',
  homeId: 'home.onboarding',
  titleKey: 'module.onboarding.title',
  eyebrow: 'DIGITAL ONBOARDING',
  title: 'Open an account',
  description: 'KYC steps are selected through a strategy, so enhanced due diligence never leaks brand checks into shared screens.',
  action: 'Start application',
  feature: 'accountOpening',
  translations: {
    'zh-CN': {'module.onboarding.title': '开户'},
    'en-US': {'module.onboarding.title': 'Open account'},
  },
});
