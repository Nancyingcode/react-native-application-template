import { createSimpleModule } from '../../modules/helpers';

// A fully independent capability: it only enters a bundle when the generated
// brand entry point imports it.
export const advancedOrdersPlugin = createSimpleModule({
  id: 'advanced-orders',
  route: 'AdvancedOrders',
  menuId: 'menu.advancedOrders',
  homeId: 'home.advancedOrders',
  titleKey: 'plugin.advancedOrders.title',
  eyebrowKey: 'plugin.advancedOrders.eyebrow',
  screenTitleKey: 'plugin.advancedOrders.screenTitle',
  descriptionKey: 'plugin.advancedOrders.description',
  feature: 'advancedOrders',
  permissions: ['trade:advanced'],
  requiresAuth: true,
  translations: {
    'zh-CN': {
      'plugin.advancedOrders.title': '高级订单',
      'plugin.advancedOrders.eyebrow': '可选插件',
      'plugin.advancedOrders.screenTitle': '高级订单',
      'plugin.advancedOrders.description':
        '条件订单以可选业务插件独立打包，平台核心不会反向依赖该能力。',
    },
    'en-US': {
      'plugin.advancedOrders.title': 'Advanced orders',
      'plugin.advancedOrders.eyebrow': 'OPTIONAL PLUGIN',
      'plugin.advancedOrders.screenTitle': 'Advanced orders',
      'plugin.advancedOrders.description':
        'Conditional orders are packaged as an optional business plugin with no dependency from the platform core.',
    },
  },
});
