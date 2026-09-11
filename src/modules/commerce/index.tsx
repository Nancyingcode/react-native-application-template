import type { AppModuleFactory } from '../contracts';
import { cartTranslations } from './cart/translations';
import { CartStore } from './CartStore';
import { catalogTranslations } from './catalog/translations';
import { checkoutTranslations } from './checkout/translations';
import { paymentsTranslations } from './payments/translations';
import { CommerceRepository } from './repository';
import { createCatalogScreens } from './catalog/screens';
import { CatalogRepository } from './catalog/api';
import { CartRepository, SkuCartStore, createSkuCartScreen } from './cart';
import { CheckoutUnavailableScreen } from './shared/CheckoutUnavailableScreen';

export const commerceModule: AppModuleFactory = {
  id: 'commerce',
  create: ({ services }) => {
    const cart = new CartStore();
    const repository = new CommerceRepository(services.http);
    const skuCart = new SkuCartStore(
      new CartRepository(services.http),
      services.session,
    );
    const screens = createCatalogScreens(repository, cart, {
      repository: new CatalogRepository(services.http),
      addItem: skuCart.addItem,
      cartSummary: {
        subscribe: skuCart.subscribe,
        getItemCount: () => {
          const state = skuCart.getSnapshot();
          const items = state.owner.userId ? state.items : state.guests;
          return items.reduce((count, item) => count + item.quantity, 0);
        },
      },
    });
    const CartScreen = createSkuCartScreen(skuCart, cart);
    let unsubscribe: (() => void) | undefined;

    return {
      id: 'commerce',
      version: '1.0.0',
      initialize: () => {
        let owner = skuCart.getSnapshot().owner;
        const refresh = () => {
          skuCart.refresh().catch(() => undefined);
        };
        refresh();
        unsubscribe = services.session.subscribe(() => {
          const current = skuCart.getSnapshot().owner;
          if (current !== owner) {
            owner = current;
            refresh();
          }
        });
      },
      dispose: () => {
        unsubscribe?.();
        skuCart.dispose();
      },
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
          component: CartScreen,
          feature: 'commerce',
        },
        {
          name: 'CommerceCheckout',
          titleKey: 'module.commerce.checkout',
          component: CheckoutUnavailableScreen,
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
          'commerce.checkout.unavailable.title': '结算暂不可用',
          'commerce.checkout.unavailable.description':
            '购物车已保留，请稍后再试。',
          'commerce.checkout.unavailable.back': '返回购物车',

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
          'commerce.checkout.unavailable.title': 'Checkout is unavailable',
          'commerce.checkout.unavailable.description':
            'Your cart is saved. Please try again later.',
          'commerce.checkout.unavailable.back': 'Back to cart',

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
