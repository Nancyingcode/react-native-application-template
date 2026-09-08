import type { AppModuleFactory } from '../contracts';
import { cartTranslations } from './cart/translations';
import { CartStore } from './CartStore';
import { catalogTranslations } from './catalog/translations';
import { checkoutTranslations } from './checkout/translations';
import { PaymentLauncher } from './payment';
import { paymentsTranslations } from './payments/translations';
import { CommerceRepository } from './repository';
import { createCommerceScreens } from './screens';

export const commerceModule: AppModuleFactory = {
  id: 'commerce',
  create: ({ services }) => {
    const cart = new CartStore();
    const repository = new CommerceRepository(services.http);
    const screens = createCommerceScreens(
      repository,
      cart,
      new PaymentLauncher(services.native),
    );

    return {
      id: 'commerce',
      version: '1.0.0',
      routes: [
        {
          name: 'CommerceProducts',
          titleKey: 'module.commerce.products',
          component: screens.ProductListScreen,
          feature: 'commerce',
        },
        {
          name: 'CommerceProductDetail',
          titleKey: 'module.commerce.detail',
          component: screens.ProductDetailScreen,
          feature: 'commerce',
        },
        {
          name: 'CommerceCart',
          titleKey: 'module.commerce.cart',
          component: screens.CartScreen,
          feature: 'commerce',
        },
        {
          name: 'CommerceCheckout',
          titleKey: 'module.commerce.checkout',
          component: screens.CheckoutScreen,
          feature: 'commerce',
          requiresAuth: true,
        },
      ],
      menus: [
        {
          id: 'menu.commerce',
          labelKey: 'module.commerce.products',
          route: 'CommerceProducts',
          order: 40,
          feature: 'commerce',
        },
        {
          id: 'menu.commerceCart',
          labelKey: 'module.commerce.cart',
          route: 'CommerceCart',
          order: 41,
          feature: 'commerce',
        },
      ],
      home: [
        {
          id: 'home.commerce',
          titleKey: 'module.commerce.products',
          route: 'CommerceProducts',
          order: 40,
          feature: 'commerce',
        },
      ],
      translations: {
        'zh-CN': {
          ...paymentsTranslations['zh-CN'],
          ...checkoutTranslations['zh-CN'],
          ...cartTranslations['zh-CN'],
          ...catalogTranslations['zh-CN'],
          'module.commerce.products': '商城',
          'module.commerce.detail': '商品详情',
          'module.commerce.cart': '购物车',
          'module.commerce.checkout': '收银台',

          'commerce.retry': '重试',

          'commerce.productImage.loadFailed.accessibilityLabel':
            '{name} 图片加载失败',
          'commerce.productImage.unavailable.compact': '暂无图片',
          'commerce.productImage.unavailable': '图片暂不可用',
          'commerce.productImage.accessibilityLabel': '{name} 商品图片',
        },
        'en-US': {
          ...paymentsTranslations['en-US'],
          ...checkoutTranslations['en-US'],
          ...cartTranslations['en-US'],
          ...catalogTranslations['en-US'],
          'module.commerce.products': 'Shop',
          'module.commerce.detail': 'Product',
          'module.commerce.cart': 'Cart',
          'module.commerce.checkout': 'Checkout',

          'commerce.retry': 'Retry',

          'commerce.productImage.loadFailed.accessibilityLabel':
            'Image failed to load for {name}',
          'commerce.productImage.unavailable.compact': 'No image',
          'commerce.productImage.unavailable': 'Image unavailable',
          'commerce.productImage.accessibilityLabel':
            'Product image for {name}',
        },
      },
    };
  },
};
