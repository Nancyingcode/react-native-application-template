import {createSimpleModule} from '../../modules/helpers';

// A fully independent capability: it only enters a bundle when the generated
// brand entry point imports it.
export const advancedOrdersPlugin = createSimpleModule({
  id: 'advanced-orders',
  route: 'AdvancedOrders',
  menuId: 'menu.advancedOrders',
  homeId: 'home.advancedOrders',
  titleKey: 'plugin.advancedOrders.title',
  eyebrow: 'OPTIONAL PLUGIN',
  title: 'Advanced orders',
  description: 'Conditional orders are packaged as an optional business plugin with no dependency from the platform core.',
  feature: 'advancedOrders',
  permissions: ['trade:advanced'],
  requiresAuth: true,
  translations: {
    'zh-CN': {'plugin.advancedOrders.title': '高级订单'},
    'en-US': {'plugin.advancedOrders.title': 'Advanced orders'},
  },
});
