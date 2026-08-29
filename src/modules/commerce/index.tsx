import { CartStore } from './CartStore';
import { PaymentLauncher } from './payment';
import { CommerceRepository } from './repository';
import { createCommerceScreens } from './screens';
import type { AppModuleFactory } from '../contracts';

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
          'module.commerce.products': '商城',
          'module.commerce.detail': '商品详情',
          'module.commerce.cart': '购物车',
          'module.commerce.checkout': '收银台',
          'commerce.products.eyebrow': '精选商城',
          'commerce.products.title': '发现好物',
          'commerce.products.notice.demo':
            '当前展示示例商品，下拉可同步服务端目录',
          'commerce.products.notice.updated': '商品目录已更新',
          'commerce.products.notice.syncFailed':
            '暂时无法同步，已保留本地商品目录',
          'commerce.products.cart.accessibilityLabel': '购物车，{count} 件商品',
          'commerce.products.cart.label': '购物车 {count}',
          'commerce.products.item.accessibilityLabel': '{name}，{price}',
          'commerce.products.item.accessibilityHint': '查看商品详情',
          'commerce.detail.loading.accessibilityLabel': '正在加载商品',
          'commerce.detail.notFound.title': '商品不存在或已下架',
          'commerce.detail.backToProducts': '返回商品列表',
          'commerce.detail.descriptionTitle': '商品介绍',
          'commerce.detail.stock': '库存 {count} 件',
          'commerce.detail.addedToCart': '已加入购物车 · 去结算',
          'commerce.detail.addToCart': '加入购物车',
          'commerce.cart.empty.title': '购物车还是空的',
          'commerce.cart.empty.description':
            '挑选心仪商品后，它们会出现在这里。',
          'commerce.cart.empty.action': '去逛逛',
          'commerce.cart.title': '购物车',
          'commerce.cart.itemCount': '共 {count} 件商品',
          'commerce.cart.quantity.decrease': '减少 {name} 的数量',
          'commerce.cart.quantity.value': '数量 {count}',
          'commerce.cart.quantity.increase': '增加 {name} 的数量',
          'commerce.cart.total': '合计',
          'commerce.cart.checkout': '去结算',
          'commerce.checkout.backToCart': '返回购物车',
          'commerce.checkout.title': '确认订单',
          'commerce.checkout.itemCountLabel': '商品数量',
          'commerce.checkout.itemCountValue': '{count} 件',
          'commerce.checkout.amountLabel': '应付金额',
          'commerce.checkout.paymentMethod': '选择支付方式',
          'commerce.payment.provider.wechat': '微信支付',
          'commerce.payment.provider.wechat.short': '微信',
          'commerce.payment.provider.wechat.mark': '微',
          'commerce.payment.provider.alipay': '支付宝支付',
          'commerce.payment.provider.alipay.short': '支付宝',
          'commerce.payment.provider.alipay.mark': '支',
          'commerce.payment.creating': '正在创建安全支付订单…',
          'commerce.payment.returnToApp':
            '完成支付后请返回本应用，我们会自动确认结果。',
          'commerce.payment.statusCheckFailed':
            '暂时无法确认结果，请稍后重试；请勿重复支付。',
          'commerce.payment.cancelled': '支付已取消，你可以重新发起。',
          'commerce.payment.failed': '支付失败，请重试。',
          'commerce.payment.pending':
            '支付平台仍在处理中，请稍后再次查询；请勿重复支付。',
          'commerce.payment.processing': '处理中…',
          'commerce.payment.payWith': '使用{provider}支付',
          'commerce.payment.check.accessibilityLabel': '查询支付结果',
          'commerce.payment.check.label': '我已完成支付，查询结果',
          'commerce.payment.securityNote':
            '支付签名由服务端生成，客户端不会保存商户私钥。支付结果以服务端查询为准。',
          'commerce.payment.success.title': '支付成功',
          'commerce.payment.success.description':
            '订单已支付，我们会尽快为你安排发货。',
          'commerce.payment.success.action': '继续购物',
          'commerce.payment.error.authenticationRequired':
            '登录状态已失效，请重新登录后支付。',
          'commerce.payment.error.launchFailed':
            '暂时无法发起支付，请稍后重试。',
          'commerce.payment.error.wechatUnavailable':
            '无法打开微信，请确认已安装并升级到最新版',
          'commerce.payment.error.alipayUnavailable':
            '无法打开支付宝，请确认已安装并升级到最新版',
          'commerce.payment.error.invalidUrl': '支付地址格式无效',
          'commerce.payment.error.untrustedUrl':
            '支付地址不属于受信任的支付平台',
          'commerce.payment.error.providerMismatch':
            '支付地址与所选支付方式不匹配',
          'commerce.productImage.loadFailed.accessibilityLabel':
            '{name} 图片加载失败',
          'commerce.productImage.unavailable.compact': '暂无图片',
          'commerce.productImage.unavailable': '图片暂不可用',
          'commerce.productImage.accessibilityLabel': '{name} 商品图片',
          'commerce.demo.category.digitalAudio': '数码影音',
          'commerce.demo.category.wearables': '智能穿戴',
          'commerce.demo.category.lifestyle': '生活方式',
          'commerce.demo.category.homeware': '家居器物',
          'commerce.demo.auroraHeadphones.name': 'Aurora Pro 降噪耳机',
          'commerce.demo.auroraHeadphones.subtitle': '沉浸声场 · 40 小时续航',
          'commerce.demo.auroraHeadphones.description':
            '双芯主动降噪与自适应通透模式，可根据环境自动调整强度。轻量化头梁适合通勤和长时间佩戴。',
          'commerce.demo.cedarWatch.name': 'Cedar 健康手表',
          'commerce.demo.cedarWatch.subtitle': '全天候健康趋势追踪',
          'commerce.demo.cedarWatch.description':
            '支持运动、睡眠和心率趋势记录，采用明亮的全天候显示屏与简洁轻盈的铝合金表壳。',
          'commerce.demo.linenBackpack.name': '城市轻旅双肩包',
          'commerce.demo.linenBackpack.subtitle': '防泼水面料 · 16 英寸电脑仓',
          'commerce.demo.linenBackpack.description':
            '为日常通勤设计的轻量背包，独立电脑仓与隐藏式安全口袋让收纳保持清晰有序。',
          'commerce.demo.ceramicSet.name': '手作陶瓷咖啡组',
          'commerce.demo.ceramicSet.subtitle': '一壶两杯 · 哑光釉面',
          'commerce.demo.ceramicSet.description':
            '温润哑光釉与自然手作纹理，每一件都保留细微差异，适合日常手冲和赠礼。',
        },
        'en-US': {
          'module.commerce.products': 'Shop',
          'module.commerce.detail': 'Product',
          'module.commerce.cart': 'Cart',
          'module.commerce.checkout': 'Checkout',
          'commerce.products.eyebrow': 'Curated shop',
          'commerce.products.title': 'Discover something great',
          'commerce.products.notice.demo':
            'Showing demo products. Pull down to sync the server catalog.',
          'commerce.products.notice.updated': 'Product catalog updated.',
          'commerce.products.notice.syncFailed':
            'Unable to sync right now. The local catalog is still available.',
          'commerce.products.cart.accessibilityLabel':
            'Cart, item count: {count}',
          'commerce.products.cart.label': 'Cart {count}',
          'commerce.products.item.accessibilityLabel': '{name}, {price}',
          'commerce.products.item.accessibilityHint': 'View product details',
          'commerce.detail.loading.accessibilityLabel': 'Loading product',
          'commerce.detail.notFound.title':
            'This product is unavailable or no longer exists',
          'commerce.detail.backToProducts': 'Back to products',
          'commerce.detail.descriptionTitle': 'About this product',
          'commerce.detail.stock': '{count} in stock',
          'commerce.detail.addedToCart': 'Added to cart · Checkout',
          'commerce.detail.addToCart': 'Add to cart',
          'commerce.cart.empty.title': 'Your cart is empty',
          'commerce.cart.empty.description':
            'Products you choose will appear here.',
          'commerce.cart.empty.action': 'Browse products',
          'commerce.cart.title': 'Cart',
          'commerce.cart.itemCount': '{count} items',
          'commerce.cart.quantity.decrease': 'Decrease quantity of {name}',
          'commerce.cart.quantity.value': 'Quantity {count}',
          'commerce.cart.quantity.increase': 'Increase quantity of {name}',
          'commerce.cart.total': 'Total',
          'commerce.cart.checkout': 'Checkout',
          'commerce.checkout.backToCart': 'Back to cart',
          'commerce.checkout.title': 'Review order',
          'commerce.checkout.itemCountLabel': 'Items',
          'commerce.checkout.itemCountValue': '{count}',
          'commerce.checkout.amountLabel': 'Amount due',
          'commerce.checkout.paymentMethod': 'Choose a payment method',
          'commerce.payment.provider.wechat': 'WeChat Pay',
          'commerce.payment.provider.wechat.short': 'WeChat',
          'commerce.payment.provider.wechat.mark': 'W',
          'commerce.payment.provider.alipay': 'Alipay',
          'commerce.payment.provider.alipay.short': 'Alipay',
          'commerce.payment.provider.alipay.mark': 'A',
          'commerce.payment.creating': 'Creating a secure payment order…',
          'commerce.payment.returnToApp':
            'Return to this app after payment. We will confirm the result automatically.',
          'commerce.payment.statusCheckFailed':
            'We cannot confirm the result right now. Try again later and do not pay twice.',
          'commerce.payment.cancelled':
            'Payment was cancelled. You can start it again.',
          'commerce.payment.failed': 'Payment failed. Please try again.',
          'commerce.payment.pending':
            'The payment provider is still processing. Check again later and do not pay twice.',
          'commerce.payment.processing': 'Processing…',
          'commerce.payment.payWith': 'Pay with {provider}',
          'commerce.payment.check.accessibilityLabel': 'Check payment result',
          'commerce.payment.check.label': 'I have paid. Check the result',
          'commerce.payment.securityNote':
            'Payment signatures are generated by the server. Merchant private keys are never stored on this device, and the server result is authoritative.',
          'commerce.payment.success.title': 'Payment successful',
          'commerce.payment.success.description':
            'Your order is paid. We will arrange shipment as soon as possible.',
          'commerce.payment.success.action': 'Continue shopping',
          'commerce.payment.error.authenticationRequired':
            'Your session has expired. Sign in again to pay.',
          'commerce.payment.error.launchFailed':
            'Unable to start payment right now. Please try again later.',
          'commerce.payment.error.wechatUnavailable':
            'Unable to open WeChat. Make sure it is installed and up to date.',
          'commerce.payment.error.alipayUnavailable':
            'Unable to open Alipay. Make sure it is installed and up to date.',
          'commerce.payment.error.invalidUrl': 'The payment URL is invalid.',
          'commerce.payment.error.untrustedUrl':
            'The payment URL is not from a trusted payment provider.',
          'commerce.payment.error.providerMismatch':
            'The payment URL does not match the selected payment method.',
          'commerce.productImage.loadFailed.accessibilityLabel':
            'Image failed to load for {name}',
          'commerce.productImage.unavailable.compact': 'No image',
          'commerce.productImage.unavailable': 'Image unavailable',
          'commerce.productImage.accessibilityLabel':
            'Product image for {name}',
          'commerce.demo.category.digitalAudio': 'Digital audio',
          'commerce.demo.category.wearables': 'Smart wearables',
          'commerce.demo.category.lifestyle': 'Lifestyle',
          'commerce.demo.category.homeware': 'Homeware',
          'commerce.demo.auroraHeadphones.name':
            'Aurora Pro Noise-Cancelling Headphones',
          'commerce.demo.auroraHeadphones.subtitle':
            'Immersive sound · 40-hour battery',
          'commerce.demo.auroraHeadphones.description':
            'Dual-chip active noise cancellation and adaptive transparency adjust automatically to your surroundings. The lightweight headband stays comfortable on commutes and during long listening sessions.',
          'commerce.demo.cedarWatch.name': 'Cedar Health Watch',
          'commerce.demo.cedarWatch.subtitle': 'All-day health trend tracking',
          'commerce.demo.cedarWatch.description':
            'Track workouts, sleep, and heart-rate trends with a bright always-on display and a clean, lightweight aluminum case.',
          'commerce.demo.linenBackpack.name': 'Urban Lightweight Backpack',
          'commerce.demo.linenBackpack.subtitle':
            'Water-resistant fabric · 16-inch laptop compartment',
          'commerce.demo.linenBackpack.description':
            'A lightweight everyday backpack with a dedicated laptop compartment and hidden security pocket to keep commuting essentials organized.',
          'commerce.demo.ceramicSet.name': 'Handcrafted Ceramic Coffee Set',
          'commerce.demo.ceramicSet.subtitle':
            'One pot, two cups · Matte glaze',
          'commerce.demo.ceramicSet.description':
            'A warm matte glaze and natural handcrafted texture give every piece subtle variations, ideal for daily pour-over coffee or gifting.',
        },
      },
    };
  },
};
