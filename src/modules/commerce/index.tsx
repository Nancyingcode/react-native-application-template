import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppNavigation } from '../../app/navigation';
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
import { CheckoutRepository } from './checkout/api';
import { createSkuCheckoutScreen } from './checkout/CheckoutScreen';
import {
  CouponsClient,
  CouponsRepository,
  CouponsProvider,
  CouponsScreen,
  CouponSelector,
  couponsTranslations,
} from './coupons';
import { PaymentsRepository } from './payments/api';
import { PaymentController } from './payments/PaymentController';
import { createPaymentScreen } from './payments/screen';
import {
  OrdersRepository,
  createOrdersScreens,
  ordersTranslations,
} from './orders';
import {
  AfterSalesRepository,
  AfterSalesStore,
  createAfterSaleScreen,
  afterSalesTranslations,
} from './after-sales';
import {
  AccountRepository,
  AccountStore,
  createAccountScreen,
  accountTranslations,
} from './account';
import {
  NotificationsRepository,
  NotificationsStore,
  createNotificationsScreen,
  UnreadBadge,
  notificationsTranslations,
} from './notifications';
import {
  SeckillRepository,
  SeckillStore,
  createSeckillScreens,
  seckillTranslations,
} from './seckill';

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
    const coupons = new CouponsClient(
      new CouponsRepository(services.http),
      services.session,
    );
    const Checkout = createSkuCheckoutScreen(
      new CheckoutRepository(services.http),
      skuCart,
      CouponSelector,
    );
    function CheckoutScreen() {
      return (
        <CouponsProvider client={coupons}>
          <Checkout />
        </CouponsProvider>
      );
    }
    function CouponScreen() {
      return (
        <CouponsProvider client={coupons}>
          <CouponsScreen />
        </CouponsProvider>
      );
    }
    const payment = new PaymentController(
      new PaymentsRepository(services.http),
      services.session,
    );
    const PaymentScreen = createPaymentScreen(payment);
    const orders = new OrdersRepository(services.http, services.session);
    const orderScreens = createOrdersScreens(orders, services.session);
    const afterSales = new AfterSalesStore(
      new AfterSalesRepository(services.http),
      orders,
      services.session,
    );
    const AfterSaleScreen = createAfterSaleScreen(afterSales);
    const account = new AccountStore(
      new AccountRepository(services.http),
      services.session,
    );
    const notifications = new NotificationsStore(
      new NotificationsRepository(services.http),
      services.session,
    );
    const Account = createAccountScreen(account);
    const NotificationsScreen = createNotificationsScreen(notifications);
    function AccountScreen() {
      const navigate = useAppNavigation();
      return (
        <View style={styles.account}>
          <View style={styles.badge}>
            <UnreadBadge
              store={notifications}
              onPress={() => navigate('CommerceNotifications')}
            />
          </View>
          <Account />
        </View>
      );
    }
    const seckillRepository = new SeckillRepository(services.http);
    const seckill = new SeckillStore(seckillRepository, services.session);
    const seckillScreens = createSeckillScreens(seckillRepository, seckill);
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
        coupons.dispose();
        payment.dispose();
        afterSales.dispose();
        orders.dispose();
        account.dispose();
        notifications.dispose();
        seckill.dispose();
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
          component: CheckoutScreen,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          name: 'CommerceCoupons',
          titleKey: 'commerce.coupons.title',
          component: CouponScreen,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          name: 'CommercePayment',
          titleKey: 'commerce.payment.v2.title',
          component: PaymentScreen,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          name: 'CommerceOrders',
          titleKey: 'commerce.orders.title',
          component: orderScreens.OrdersScreen,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          name: 'CommerceOrderDetail',
          titleKey: 'commerce.orders.detail',
          component: orderScreens.OrderDetailScreen,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          name: 'CommerceAfterSale',
          titleKey: 'commerce.afterSales.title',
          component: AfterSaleScreen,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          name: 'CommerceAccount',
          titleKey: 'commerce.account.title',
          component: AccountScreen,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          name: 'CommerceNotifications',
          titleKey: 'commerce.notifications.title',
          component: NotificationsScreen,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          name: 'CommerceSeckill',
          titleKey: 'commerce.seckill.title',
          component: seckillScreens.SeckillListScreen,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          name: 'CommerceSeckillDetail',
          titleKey: 'commerce.seckill.detailTitle',
          component: seckillScreens.SeckillDetailScreen,
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
        {
          id: 'menu.CommerceCoupons',
          labelKey: 'commerce.coupons.title',
          route: 'CommerceCoupons',
          order: 42,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          id: 'menu.CommerceOrders',
          labelKey: 'commerce.orders.title',
          route: 'CommerceOrders',
          order: 43,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          id: 'menu.CommerceAccount',
          labelKey: 'commerce.account.title',
          route: 'CommerceAccount',
          order: 44,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          id: 'menu.CommerceNotifications',
          labelKey: 'commerce.notifications.title',
          route: 'CommerceNotifications',
          order: 45,
          feature: 'commerce',
          requiresAuth: true,
        },
        {
          id: 'menu.CommerceSeckill',
          labelKey: 'commerce.seckill.title',
          route: 'CommerceSeckill',
          order: 46,
          feature: 'commerce',
          requiresAuth: true,
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
          ...couponsTranslations['zh-CN'],
          ...ordersTranslations['zh-CN'],
          ...afterSalesTranslations['zh-CN'],
          ...accountTranslations['zh-CN'],
          ...notificationsTranslations['zh-CN'],
          ...seckillTranslations['zh-CN'],
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
          ...couponsTranslations.en,
          ...ordersTranslations['en-US'],
          ...afterSalesTranslations['en-US'],
          ...accountTranslations['en-US'],
          ...notificationsTranslations['en-US'],
          ...seckillTranslations['en-US'],
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

const styles = StyleSheet.create({
  account: { flex: 1 },
  badge: {
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    paddingHorizontal: 12,
  },
});
