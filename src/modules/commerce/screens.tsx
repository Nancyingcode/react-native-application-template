import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAppNavigation, useRouteParams } from '../../app/navigation';
import { useApplication } from '../../app/ApplicationProvider';
import { AuthenticationRequiredError } from '../../core/http';
import { CartStore, useCart } from './CartStore';
import { demoProducts, formatMoney } from './catalog';
import { PaymentLaunchError, PaymentLauncher } from './payment';
import { CommerceRepository } from './repository';
import type { PaymentProvider, PaymentStatus, Product } from './types';

interface CommerceScreens {
  ProductListScreen(): React.JSX.Element;
  ProductDetailScreen(): React.JSX.Element;
  CartScreen(): React.JSX.Element;
  CheckoutScreen(): React.JSX.Element;
}

export function createCommerceScreens(
  repository: CommerceRepository,
  cart: CartStore,
  paymentLauncher: PaymentLauncher,
): CommerceScreens {
  function ProductListScreen(): React.JSX.Element {
    const { brand, services } = useApplication();
    const navigate = useAppNavigation();
    const snapshot = useCart(cart);
    const [products, setProducts] = useState(demoProducts);
    const [refreshing, setRefreshing] = useState(false);
    const [notice, setNotice] = useState(
      '当前展示示例商品，下拉可同步服务端目录',
    );
    const colors = brand.theme.colors;

    const refresh = async (): Promise<void> => {
      setRefreshing(true);
      try {
        const remoteProducts = await repository.listProducts();
        setProducts(remoteProducts);
        setNotice('商品目录已更新');
      } catch (error) {
        services.monitor.capture(error, { scope: 'commerce.products' });
        setNotice('暂时无法同步，已保留本地商品目录');
      } finally {
        setRefreshing(false);
      }
    };

    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.pageHeader}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>
              精选商城
            </Text>
            <Text style={[styles.title, { color: colors.text }]}>发现好物</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate('CommerceCart')}
            style={[styles.cartPill, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.cartPillText}>购物车 {snapshot.itemCount}</Text>
          </Pressable>
        </View>
        <Text style={[styles.notice, { color: colors.textMuted }]}>
          {notice}
        </Text>
        <FlatList
          data={products}
          keyExtractor={product => product.id}
          numColumns={2}
          columnWrapperStyle={styles.productRow}
          contentContainerStyle={styles.productList}
          refreshing={refreshing}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                navigate('CommerceProductDetail', { productId: item.id })
              }
              style={({ pressed }) => [
                styles.productCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: pressed ? colors.primary : colors.border,
                },
              ]}
            >
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.productImage}
              />
              <Text style={[styles.productCategory, { color: colors.primary }]}>
                {item.category}
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.productName, { color: colors.text }]}
              >
                {item.name}
              </Text>
              <Text style={[styles.price, { color: colors.text }]}>
                {formatMoney(item.priceMinor, item.currency)}
              </Text>
            </Pressable>
          )}
          ListFooterComponent={
            refreshing ? <ActivityIndicator color={colors.primary} /> : null
          }
        />
      </View>
    );
  }

  function ProductDetailScreen(): React.JSX.Element {
    const { brand, services } = useApplication();
    const navigate = useAppNavigation();
    const { productId } = useRouteParams();
    const initialProduct = demoProducts.find(item => item.id === productId);
    const [product, setProduct] = useState<Product | undefined>(initialProduct);
    const [loading, setLoading] = useState(!initialProduct);
    const [added, setAdded] = useState(false);
    const colors = brand.theme.colors;

    useEffect(() => {
      if (initialProduct || !productId) {
        return;
      }
      let active = true;
      repository
        .getProduct(productId)
        .then(item => active && setProduct(item))
        .catch(error =>
          services.monitor.capture(error, { scope: 'commerce.product' }),
        )
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [initialProduct, productId, services.monitor]);

    if (loading) {
      return (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      );
    }
    if (!product) {
      return (
        <EmptyState
          title="商品不存在或已下架"
          action="返回商品列表"
          onAction={() => navigate('CommerceProducts')}
        />
      );
    }

    const addToCart = (): void => {
      cart.add(product);
      setAdded(true);
      services.analytics.track('commerce_add_to_cart', {
        productId: product.id,
      });
    };

    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.detailContent}
      >
        <Pressable onPress={() => navigate('CommerceProducts')}>
          <Text style={[styles.back, { color: colors.primary }]}>
            ← 返回商品列表
          </Text>
        </Pressable>
        <Image source={{ uri: product.imageUrl }} style={styles.detailImage} />
        <Text style={[styles.productCategory, { color: colors.primary }]}>
          {product.category}
        </Text>
        <Text style={[styles.detailTitle, { color: colors.text }]}>
          {product.name}
        </Text>
        <Text style={[styles.detailSubtitle, { color: colors.textMuted }]}>
          {product.subtitle}
        </Text>
        <Text style={[styles.detailPrice, { color: colors.text }]}>
          {formatMoney(product.priceMinor, product.currency)}
        </Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          商品介绍
        </Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          {product.description}
        </Text>
        <Text style={[styles.stock, { color: colors.textMuted }]}>
          库存 {product.inventory} 件
        </Text>
        <PrimaryButton
          label={added ? '已加入购物车 · 去结算' : '加入购物车'}
          onPress={added ? () => navigate('CommerceCart') : addToCart}
        />
      </ScrollView>
    );
  }

  function CartScreen(): React.JSX.Element {
    const { brand } = useApplication();
    const navigate = useAppNavigation();
    const snapshot = useCart(cart);
    const colors = brand.theme.colors;

    if (snapshot.lines.length === 0) {
      return (
        <EmptyState
          title="购物车还是空的"
          description="挑选心仪商品后，它们会出现在这里。"
          action="去逛逛"
          onAction={() => navigate('CommerceProducts')}
        />
      );
    }

    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.cartContent}>
          <Text style={[styles.title, { color: colors.text }]}>购物车</Text>
          <Text style={[styles.notice, { color: colors.textMuted }]}>
            共 {snapshot.itemCount} 件商品
          </Text>
          {snapshot.lines.map(line => (
            <View
              key={line.product.id}
              style={[
                styles.cartLine,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Image
                source={{ uri: line.product.imageUrl }}
                style={styles.cartImage}
              />
              <View style={styles.cartLineCopy}>
                <Text style={[styles.cartLineName, { color: colors.text }]}>
                  {line.product.name}
                </Text>
                <Text style={[styles.price, { color: colors.text }]}>
                  {formatMoney(line.product.priceMinor, line.product.currency)}
                </Text>
                <View style={styles.quantityRow}>
                  <QuantityButton
                    label="−"
                    onPress={() =>
                      cart.setQuantity(line.product, line.quantity - 1)
                    }
                  />
                  <Text style={[styles.quantity, { color: colors.text }]}>
                    {line.quantity}
                  </Text>
                  <QuantityButton
                    label="+"
                    onPress={() =>
                      cart.setQuantity(line.product, line.quantity + 1)
                    }
                  />
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={[styles.cartFooter, { backgroundColor: colors.surface }]}>
          <View>
            <Text style={[styles.totalLabel, { color: colors.textMuted }]}>
              合计
            </Text>
            <Text style={[styles.total, { color: colors.text }]}>
              {formatMoney(
                snapshot.totalMinor,
                snapshot.lines[0].product.currency,
              )}
            </Text>
          </View>
          <PrimaryButton
            label="去结算"
            onPress={() => navigate('CommerceCheckout')}
            compact
          />
        </View>
      </View>
    );
  }

  function CheckoutScreen(): React.JSX.Element {
    const { brand, services } = useApplication();
    const navigate = useAppNavigation();
    const snapshot = useCart(cart);
    const providers = brand.commerce?.paymentProviders ?? ['wechat', 'alipay'];
    const [provider, setProvider] = useState<PaymentProvider>(providers[0]);
    const [phase, setPhase] = useState<
      'idle' | 'creating' | 'waiting' | 'checking' | 'succeeded' | 'failed'
    >('idle');
    const [paymentId, setPaymentId] = useState<string>();
    const [message, setMessage] = useState('');
    const paymentInFlight = useRef(false);
    const statusInFlight = useRef(false);
    const colors = brand.theme.colors;
    const busy = phase === 'creating' || phase === 'checking';

    const checkPayment = useCallback(async (): Promise<void> => {
      if (!paymentId) {
        return;
      }
      if (statusInFlight.current) {
        return;
      }
      statusInFlight.current = true;
      setPhase('checking');
      try {
        const status = await repository.getPaymentStatus(paymentId);
        applyPaymentStatus(status, setPhase, setMessage);
        if (status === 'succeeded') {
          cart.clear();
          services.analytics.track('commerce_payment_succeeded', {
            provider,
          });
        }
      } catch (error) {
        services.monitor.capture(error, { scope: 'commerce.payment.status' });
        setPhase('waiting');
        setMessage('暂时无法确认结果，请稍后重试；请勿重复支付。');
      } finally {
        statusInFlight.current = false;
      }
    }, [paymentId, provider, services.analytics, services.monitor]);

    useEffect(() => {
      if (!paymentId) {
        return;
      }
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') {
          checkPayment();
        }
      });
      return () => subscription.remove();
    }, [checkPayment, paymentId]);

    const pay = async (): Promise<void> => {
      if (paymentInFlight.current) {
        return;
      }
      if (snapshot.lines.length === 0) {
        navigate('CommerceCart');
        return;
      }
      paymentInFlight.current = true;
      setPhase('creating');
      setMessage('正在创建安全支付订单…');
      try {
        const order = await repository.createOrder(snapshot.lines);
        const session = await repository.createPayment(order.id, provider);
        setPaymentId(session.id);
        setPhase('waiting');
        setMessage('完成支付后请返回本应用，我们会自动确认结果。');
        services.analytics.track('commerce_payment_launched', {
          provider,
        });
        await paymentLauncher.launch(session);
      } catch (error) {
        setPhase('failed');
        setMessage(toPaymentErrorMessage(error));
        services.monitor.capture(error, { scope: 'commerce.payment.launch' });
      } finally {
        paymentInFlight.current = false;
      }
    };

    if (phase === 'succeeded') {
      return (
        <EmptyState
          title="支付成功"
          description="订单已支付，我们会尽快为你安排发货。"
          action="继续购物"
          onAction={() => navigate('CommerceProducts')}
          success
        />
      );
    }

    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.checkoutContent}
      >
        <Pressable onPress={() => navigate('CommerceCart')}>
          <Text style={[styles.back, { color: colors.primary }]}>
            ← 返回购物车
          </Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>确认订单</Text>
        <View style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
          <SummaryRow label="商品数量" value={`${snapshot.itemCount} 件`} />
          <SummaryRow
            label="应付金额"
            value={formatMoney(
              snapshot.totalMinor,
              snapshot.lines[0]?.product.currency ??
                brand.commerce?.currency ??
                'CNY',
            )}
            strong
          />
        </View>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          选择支付方式
        </Text>
        {providers.map(item => (
          <Pressable
            key={item}
            disabled={busy}
            onPress={() => setProvider(item)}
            style={[
              styles.provider,
              {
                backgroundColor: colors.surface,
                borderColor: provider === item ? colors.primary : colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.providerIcon,
                item === 'wechat' ? styles.wechatIcon : styles.alipayIcon,
              ]}
            >
              <Text style={styles.providerIconText}>
                {item === 'wechat' ? '微' : '支'}
              </Text>
            </View>
            <Text style={[styles.providerName, { color: colors.text }]}>
              {item === 'wechat' ? '微信支付' : '支付宝支付'}
            </Text>
            <Text style={[styles.radio, { color: colors.primary }]}>
              {provider === item ? '●' : '○'}
            </Text>
          </Pressable>
        ))}
        {message ? (
          <Text
            style={[
              styles.paymentMessage,
              { color: phase === 'failed' ? colors.danger : colors.textMuted },
            ]}
          >
            {message}
          </Text>
        ) : null}
        <PrimaryButton
          label={
            busy
              ? '处理中…'
              : `使用${provider === 'wechat' ? '微信' : '支付宝'}支付`
          }
          onPress={pay}
          disabled={busy || snapshot.lines.length === 0}
        />
        {paymentId && phase !== 'creating' ? (
          <Pressable
            disabled={busy}
            onPress={checkPayment}
            style={styles.checkButton}
          >
            <Text style={[styles.checkButtonText, { color: colors.primary }]}>
              我已完成支付，查询结果
            </Text>
          </Pressable>
        ) : null}
        <Text style={[styles.securityNote, { color: colors.textMuted }]}>
          支付签名由服务端生成，客户端不会保存商户私钥。支付结果以服务端查询为准。
        </Text>
      </ScrollView>
    );
  }

  return { ProductListScreen, ProductDetailScreen, CartScreen, CheckoutScreen };
}

function applyPaymentStatus(
  status: PaymentStatus,
  setPhase: (phase: 'waiting' | 'succeeded' | 'failed') => void,
  setMessage: (message: string) => void,
): void {
  if (status === 'succeeded') {
    setPhase('succeeded');
    setMessage('支付成功');
  } else if (status === 'failed' || status === 'cancelled') {
    setPhase('failed');
    setMessage(
      status === 'cancelled'
        ? '支付已取消，你可以重新发起。'
        : '支付失败，请重试。',
    );
  } else {
    setPhase('waiting');
    setMessage('支付平台仍在处理中，请稍后再次查询；请勿重复支付。');
  }
}

function toPaymentErrorMessage(error: unknown): string {
  if (error instanceof AuthenticationRequiredError) {
    return '登录状态已失效，请重新登录后支付。';
  }
  if (error instanceof PaymentLaunchError) {
    return error.message;
  }
  return '暂时无法发起支付，请稍后重试。';
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  compact?: boolean;
}): React.JSX.Element {
  const { brand } = useApplication();
  const colors = brand.theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact && styles.compactButton,
        {
          backgroundColor: disabled
            ? colors.border
            : pressed
            ? colors.primaryPressed
            : colors.primary,
        },
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function QuantityButton({
  label,
  onPress,
}: {
  label: string;
  onPress(): void;
}): React.JSX.Element {
  const { brand } = useApplication();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.quantityButton,
        { borderColor: brand.theme.colors.border },
      ]}
    >
      <Text
        style={[styles.quantityButtonText, { color: brand.theme.colors.text }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): React.JSX.Element {
  const { brand } = useApplication();
  return (
    <View style={styles.summaryRow}>
      <Text
        style={[styles.summaryLabel, { color: brand.theme.colors.textMuted }]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.summaryValue,
          strong && styles.summaryValueStrong,
          { color: brand.theme.colors.text },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function EmptyState({
  title,
  description,
  action,
  onAction,
  success = false,
}: {
  title: string;
  description?: string;
  action: string;
  onAction(): void;
  success?: boolean;
}): React.JSX.Element {
  const { brand } = useApplication();
  const colors = brand.theme.colors;
  return (
    <View style={[styles.empty, { backgroundColor: colors.background }]}>
      <Text
        style={[
          styles.emptyIcon,
          { color: success ? colors.success : colors.primary },
        ]}
      >
        {success ? '✓' : '◇'}
      </Text>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.emptyDescription, { color: colors.textMuted }]}>
          {description}
        </Text>
      ) : null}
      <PrimaryButton label={action} onPress={onAction} compact />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { flex: 1 },
  pageHeader: {
    paddingHorizontal: 20,
    paddingTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  title: { fontSize: 28, fontWeight: '900' },
  notice: { fontSize: 12, marginHorizontal: 20, marginTop: 8 },
  cartPill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  cartPillText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  productList: { padding: 14, paddingBottom: 30 },
  productRow: { gap: 10 },
  productCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
  },
  productImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 11,
    backgroundColor: '#E9EBF1',
  },
  productCategory: { fontSize: 11, fontWeight: '800', marginTop: 10 },
  productName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    marginTop: 4,
    minHeight: 40,
  },
  price: { fontSize: 14, fontWeight: '900', marginTop: 7 },
  detailContent: { padding: 20, paddingBottom: 42 },
  back: { fontSize: 14, fontWeight: '800', marginBottom: 18 },
  detailImage: {
    width: '100%',
    aspectRatio: 1.3,
    borderRadius: 20,
    backgroundColor: '#E9EBF1',
  },
  detailTitle: { fontSize: 27, fontWeight: '900', marginTop: 8 },
  detailSubtitle: { fontSize: 14, marginTop: 6 },
  detailPrice: { fontSize: 24, fontWeight: '900', marginTop: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 22 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 20,
    marginBottom: 10,
  },
  description: { fontSize: 15, lineHeight: 24 },
  stock: { fontSize: 12, marginTop: 14 },
  primaryButton: {
    borderRadius: 14,
    marginTop: 24,
    paddingHorizontal: 22,
    paddingVertical: 15,
    alignItems: 'center',
  },
  compactButton: { marginTop: 0, minWidth: 122 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  cartContent: { padding: 20, paddingBottom: 30 },
  cartLine: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    marginTop: 12,
  },
  cartImage: {
    width: 92,
    height: 92,
    borderRadius: 12,
    backgroundColor: '#E9EBF1',
  },
  cartLineCopy: { flex: 1, marginLeft: 13 },
  cartLineName: { fontSize: 15, fontWeight: '800' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  quantityButton: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: { fontSize: 18, fontWeight: '700' },
  quantity: { width: 36, textAlign: 'center', fontWeight: '800' },
  cartFooter: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: { fontSize: 11 },
  total: { fontSize: 22, fontWeight: '900', marginTop: 2 },
  checkoutContent: { padding: 20, paddingBottom: 40 },
  summaryCard: { borderRadius: 16, padding: 16, marginTop: 18 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
  },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '700' },
  summaryValueStrong: { fontSize: 20, fontWeight: '900' },
  provider: {
    borderWidth: 1,
    borderRadius: 15,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  providerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wechatIcon: { backgroundColor: '#07C160' },
  alipayIcon: { backgroundColor: '#1677FF' },
  providerIconText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  providerName: { flex: 1, fontSize: 16, fontWeight: '800', marginLeft: 12 },
  radio: { fontSize: 18 },
  paymentMessage: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  checkButton: { padding: 15, alignItems: 'center' },
  checkButtonText: { fontSize: 14, fontWeight: '800' },
  securityNote: {
    fontSize: 11,
    lineHeight: 18,
    marginTop: 18,
    textAlign: 'center',
  },
  empty: {
    flex: 1,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: { fontSize: 52, fontWeight: '300', marginBottom: 12 },
  emptyTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  emptyDescription: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
});
