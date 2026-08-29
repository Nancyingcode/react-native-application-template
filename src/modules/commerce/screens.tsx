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
  useWindowDimensions,
  View,
} from 'react-native';
import { useAppNavigation, useRouteParams } from '../../app/navigation';
import { useApplication } from '../../app/ApplicationProvider';
import { AuthenticationRequiredError } from '../../core/http';
import { CartStore, useCart } from './CartStore';
import { formatMoney, getDemoProducts, isDemoProduct } from './catalog';
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
    const { brand, locale, services } = useApplication();
    const navigate = useAppNavigation();
    const snapshot = useCart(cart);
    const { width } = useWindowDimensions();
    const demoProducts = getDemoProducts(services.i18n.t.bind(services.i18n));
    const [remoteProducts, setRemoteProducts] = useState<Product[]>();
    const [refreshing, setRefreshing] = useState(false);
    const [noticeKey, setNoticeKey] = useState('commerce.products.notice.demo');
    const products = remoteProducts ?? demoProducts;
    const colors = brand.theme.colors;
    const columns = width >= 768 ? 3 : 2;
    const listWidth = Math.min(width, 1080);
    const listPadding = width >= 768 ? 32 : 20;
    const productGap = 12;
    const productCardWidth =
      (listWidth - listPadding * 2 - productGap * (columns - 1)) / columns;

    const refresh = async (): Promise<void> => {
      setRefreshing(true);
      try {
        const fetchedProducts = await repository.listProducts();
        setRemoteProducts(fetchedProducts);
        setNoticeKey('commerce.products.notice.updated');
      } catch (error) {
        services.monitor.capture(error, { scope: 'commerce.products' });
        setNoticeKey('commerce.products.notice.syncFailed');
      } finally {
        setRefreshing(false);
      }
    };

    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>
              {services.i18n.t('commerce.products.eyebrow')}
            </Text>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.text }]}
            >
              {services.i18n.t('commerce.products.title')}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={services.i18n.t(
              'commerce.products.cart.accessibilityLabel',
              { count: snapshot.itemCount },
            )}
            accessibilityRole="button"
            onPress={() => navigate('CommerceCart')}
            style={({ pressed }) => [
              styles.cartPill,
              {
                backgroundColor: pressed
                  ? colors.primaryPressed
                  : colors.primary,
              },
            ]}
          >
            <Text style={styles.cartPillText}>
              {services.i18n.t('commerce.products.cart.label', {
                count: snapshot.itemCount,
              })}
            </Text>
          </Pressable>
        </View>
        <View
          style={[
            styles.noticePanel,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.notice, { color: colors.textMuted }]}
          >
            {services.i18n.t(noticeKey)}
          </Text>
        </View>
        <FlatList
          key={`product-grid-${columns}`}
          data={products}
          keyExtractor={product => product.id}
          numColumns={columns}
          style={styles.productListContainer}
          columnWrapperStyle={styles.productRow}
          contentContainerStyle={[
            styles.productList,
            { paddingHorizontal: listPadding },
          ]}
          refreshing={refreshing}
          onRefresh={refresh}
          renderItem={({ item }) => (
            <Pressable
              accessibilityLabel={services.i18n.t(
                'commerce.products.item.accessibilityLabel',
                {
                  name: item.name,
                  price: formatMoney(item.priceMinor, item.currency, locale),
                },
              )}
              accessibilityHint={services.i18n.t(
                'commerce.products.item.accessibilityHint',
              )}
              accessibilityRole="button"
              onPress={() =>
                navigate('CommerceProductDetail', {
                  productId: item.id,
                  source: remoteProducts ? 'remote' : 'demo',
                })
              }
              style={({ pressed }) => [
                styles.productCard,
                {
                  width: productCardWidth,
                  backgroundColor: colors.surface,
                  borderColor: pressed ? colors.primary : colors.border,
                },
              ]}
            >
              <ProductImage product={item} variant="card" />
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
                {formatMoney(item.priceMinor, item.currency, locale)}
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
    const { brand, locale, services } = useApplication();
    const navigate = useAppNavigation();
    const { productId, source } = useRouteParams();
    const demoProduct =
      source === 'remote'
        ? undefined
        : getDemoProducts(services.i18n.t.bind(services.i18n)).find(
            item => item.id === productId,
          );
    const [remoteProduct, setRemoteProduct] = useState<Product>();
    const [loading, setLoading] = useState(!demoProduct);
    const [added, setAdded] = useState(false);
    const product = demoProduct ?? remoteProduct;
    const colors = brand.theme.colors;

    useEffect(() => {
      if (demoProduct || !productId) {
        return;
      }
      let active = true;
      repository
        .getProduct(productId)
        .then(item => active && setRemoteProduct(item))
        .catch(error =>
          services.monitor.capture(error, { scope: 'commerce.product' }),
        )
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, [demoProduct, productId, services.monitor]);

    if (loading) {
      return (
        <ActivityIndicator
          accessibilityLabel={services.i18n.t(
            'commerce.detail.loading.accessibilityLabel',
          )}
          accessibilityRole="progressbar"
          style={styles.loading}
          color={colors.primary}
        />
      );
    }
    if (!product) {
      return (
        <EmptyState
          title={services.i18n.t('commerce.detail.notFound.title')}
          action={services.i18n.t('commerce.detail.backToProducts')}
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
        <Pressable
          accessibilityLabel={services.i18n.t('commerce.detail.backToProducts')}
          accessibilityRole="button"
          onPress={() => navigate('CommerceProducts')}
          style={styles.backButton}
        >
          <Text style={[styles.back, { color: colors.primary }]}>
            ← {services.i18n.t('commerce.detail.backToProducts')}
          </Text>
        </Pressable>
        <ProductImage product={product} variant="detail" />
        <Text style={[styles.productCategory, { color: colors.primary }]}>
          {product.category}
        </Text>
        <Text
          accessibilityRole="header"
          style={[styles.detailTitle, { color: colors.text }]}
        >
          {product.name}
        </Text>
        <Text style={[styles.detailSubtitle, { color: colors.textMuted }]}>
          {product.subtitle}
        </Text>
        <Text style={[styles.detailPrice, { color: colors.text }]}>
          {formatMoney(product.priceMinor, product.currency, locale)}
        </Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {services.i18n.t('commerce.detail.descriptionTitle')}
        </Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          {product.description}
        </Text>
        <Text style={[styles.stock, { color: colors.textMuted }]}>
          {services.i18n.t('commerce.detail.stock', {
            count: product.inventory,
          })}
        </Text>
        <PrimaryButton
          label={services.i18n.t(
            added ? 'commerce.detail.addedToCart' : 'commerce.detail.addToCart',
          )}
          onPress={added ? () => navigate('CommerceCart') : addToCart}
        />
      </ScrollView>
    );
  }

  function CartScreen(): React.JSX.Element {
    const { brand, locale, services } = useApplication();
    const navigate = useAppNavigation();
    const snapshot = useCart(cart);
    const demoProducts = getDemoProducts(services.i18n.t.bind(services.i18n));
    const colors = brand.theme.colors;

    if (snapshot.lines.length === 0) {
      return (
        <EmptyState
          title={services.i18n.t('commerce.cart.empty.title')}
          description={services.i18n.t('commerce.cart.empty.description')}
          action={services.i18n.t('commerce.cart.empty.action')}
          onAction={() => navigate('CommerceProducts')}
        />
      );
    }

    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.cartContent}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: colors.text }]}
          >
            {services.i18n.t('commerce.cart.title')}
          </Text>
          <Text
            style={[
              styles.notice,
              styles.cartNotice,
              { color: colors.textMuted },
            ]}
          >
            {services.i18n.t('commerce.cart.itemCount', {
              count: snapshot.itemCount,
            })}
          </Text>
          {snapshot.lines.map(line => {
            const product = isDemoProduct(line.product)
              ? demoProducts.find(item => item.id === line.product.id) ??
                line.product
              : line.product;
            return (
              <View
                key={line.product.id}
                style={[
                  styles.cartLine,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <ProductImage product={product} variant="cart" />
                <View style={styles.cartLineCopy}>
                  <Text style={[styles.cartLineName, { color: colors.text }]}>
                    {product.name}
                  </Text>
                  <Text style={[styles.price, { color: colors.text }]}>
                    {formatMoney(product.priceMinor, product.currency, locale)}
                  </Text>
                  <View style={styles.quantityRow}>
                    <QuantityButton
                      label="−"
                      accessibilityLabel={services.i18n.t(
                        'commerce.cart.quantity.decrease',
                        { name: product.name },
                      )}
                      onPress={() =>
                        cart.setQuantity(line.product, line.quantity - 1)
                      }
                    />
                    <Text
                      accessibilityLabel={services.i18n.t(
                        'commerce.cart.quantity.value',
                        { count: line.quantity },
                      )}
                      style={[styles.quantity, { color: colors.text }]}
                    >
                      {line.quantity}
                    </Text>
                    <QuantityButton
                      label="+"
                      accessibilityLabel={services.i18n.t(
                        'commerce.cart.quantity.increase',
                        { name: product.name },
                      )}
                      onPress={() =>
                        cart.setQuantity(line.product, line.quantity + 1)
                      }
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
        <View
          style={[
            styles.cartFooter,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
          ]}
        >
          <View>
            <Text style={[styles.totalLabel, { color: colors.textMuted }]}>
              {services.i18n.t('commerce.cart.total')}
            </Text>
            <Text style={[styles.total, { color: colors.text }]}>
              {formatMoney(
                snapshot.totalMinor,
                snapshot.lines[0].product.currency,
                locale,
              )}
            </Text>
          </View>
          <PrimaryButton
            label={services.i18n.t('commerce.cart.checkout')}
            onPress={() => navigate('CommerceCheckout')}
            compact
          />
        </View>
      </View>
    );
  }

  function CheckoutScreen(): React.JSX.Element {
    const { brand, locale, services } = useApplication();
    const navigate = useAppNavigation();
    const snapshot = useCart(cart);
    const providers = brand.commerce?.paymentProviders ?? ['wechat', 'alipay'];
    const [provider, setProvider] = useState<PaymentProvider>(providers[0]);
    const [phase, setPhase] = useState<
      'idle' | 'creating' | 'waiting' | 'checking' | 'succeeded' | 'failed'
    >('idle');
    const [paymentId, setPaymentId] = useState<string>();
    const [messageKey, setMessageKey] = useState('');
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
        applyPaymentStatus(status, setPhase, setMessageKey);
        if (status === 'succeeded') {
          cart.clear();
          services.analytics.track('commerce_payment_succeeded', {
            provider,
          });
        }
      } catch (error) {
        services.monitor.capture(error, { scope: 'commerce.payment.status' });
        setPhase('waiting');
        setMessageKey('commerce.payment.statusCheckFailed');
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
      setMessageKey('commerce.payment.creating');
      try {
        const order = await repository.createOrder(snapshot.lines);
        const session = await repository.createPayment(order.id, provider);
        setPaymentId(session.id);
        setPhase('waiting');
        setMessageKey('commerce.payment.returnToApp');
        services.analytics.track('commerce_payment_launched', {
          provider,
        });
        await paymentLauncher.launch(session);
      } catch (error) {
        setPhase('failed');
        setMessageKey(toPaymentErrorKey(error));
        services.monitor.capture(error, { scope: 'commerce.payment.launch' });
      } finally {
        paymentInFlight.current = false;
      }
    };

    if (phase === 'succeeded') {
      return (
        <EmptyState
          title={services.i18n.t('commerce.payment.success.title')}
          description={services.i18n.t('commerce.payment.success.description')}
          action={services.i18n.t('commerce.payment.success.action')}
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
        <Pressable
          accessibilityLabel={services.i18n.t('commerce.checkout.backToCart')}
          accessibilityRole="button"
          onPress={() => navigate('CommerceCart')}
          style={styles.backButton}
        >
          <Text style={[styles.back, { color: colors.primary }]}>
            ← {services.i18n.t('commerce.checkout.backToCart')}
          </Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {services.i18n.t('commerce.checkout.title')}
        </Text>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <SummaryRow
            label={services.i18n.t('commerce.checkout.itemCountLabel')}
            value={services.i18n.t('commerce.checkout.itemCountValue', {
              count: snapshot.itemCount,
            })}
          />
          <SummaryRow
            label={services.i18n.t('commerce.checkout.amountLabel')}
            value={formatMoney(
              snapshot.totalMinor,
              snapshot.lines[0]?.product.currency ??
                brand.commerce?.currency ??
                'CNY',
              locale,
            )}
            strong
          />
        </View>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {services.i18n.t('commerce.checkout.paymentMethod')}
        </Text>
        {providers.map(item => (
          <Pressable
            accessibilityLabel={services.i18n.t(
              `commerce.payment.provider.${item}`,
            )}
            accessibilityRole="radio"
            accessibilityState={{ checked: provider === item, disabled: busy }}
            key={item}
            disabled={busy}
            onPress={() => setProvider(item)}
            style={[
              styles.provider,
              {
                backgroundColor: colors.surface,
                borderColor: provider === item ? colors.primary : colors.border,
              },
              busy && styles.providerDisabled,
            ]}
          >
            <View
              style={[
                styles.providerIcon,
                item === 'wechat' ? styles.wechatIcon : styles.alipayIcon,
              ]}
            >
              <Text style={styles.providerIconText}>
                {services.i18n.t(`commerce.payment.provider.${item}.mark`)}
              </Text>
            </View>
            <Text style={[styles.providerName, { color: colors.text }]}>
              {services.i18n.t(`commerce.payment.provider.${item}`)}
            </Text>
            <Text style={[styles.radio, { color: colors.primary }]}>
              {provider === item ? '●' : '○'}
            </Text>
          </Pressable>
        ))}
        {messageKey ? (
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole={phase === 'failed' ? 'alert' : undefined}
            style={[
              styles.paymentMessage,
              { color: phase === 'failed' ? colors.danger : colors.textMuted },
            ]}
          >
            {services.i18n.t(messageKey)}
          </Text>
        ) : null}
        <PrimaryButton
          label={
            busy
              ? services.i18n.t('commerce.payment.processing')
              : services.i18n.t('commerce.payment.payWith', {
                  provider: services.i18n.t(
                    `commerce.payment.provider.${provider}.short`,
                  ),
                })
          }
          onPress={pay}
          disabled={busy || snapshot.lines.length === 0}
        />
        {paymentId && phase !== 'creating' ? (
          <Pressable
            accessibilityLabel={services.i18n.t(
              'commerce.payment.check.accessibilityLabel',
            )}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={checkPayment}
            style={styles.checkButton}
          >
            <Text style={[styles.checkButtonText, { color: colors.primary }]}>
              {services.i18n.t('commerce.payment.check.label')}
            </Text>
          </Pressable>
        ) : null}
        <Text style={[styles.securityNote, { color: colors.textMuted }]}>
          {services.i18n.t('commerce.payment.securityNote')}
        </Text>
      </ScrollView>
    );
  }

  return { ProductListScreen, ProductDetailScreen, CartScreen, CheckoutScreen };
}

function applyPaymentStatus(
  status: PaymentStatus,
  setPhase: (phase: 'waiting' | 'succeeded' | 'failed') => void,
  setMessageKey: (messageKey: string) => void,
): void {
  if (status === 'succeeded') {
    setPhase('succeeded');
    setMessageKey('commerce.payment.success.title');
  } else if (status === 'failed' || status === 'cancelled') {
    setPhase('failed');
    setMessageKey(
      status === 'cancelled'
        ? 'commerce.payment.cancelled'
        : 'commerce.payment.failed',
    );
  } else {
    setPhase('waiting');
    setMessageKey('commerce.payment.pending');
  }
}

function toPaymentErrorKey(error: unknown): string {
  if (error instanceof AuthenticationRequiredError) {
    return 'commerce.payment.error.authenticationRequired';
  }
  if (error instanceof PaymentLaunchError) {
    return error.messageKey;
  }
  return 'commerce.payment.error.launchFailed';
}

function ProductImage({
  product,
  variant,
}: {
  product: Product;
  variant: 'card' | 'detail' | 'cart';
}): React.JSX.Element {
  const { brand, services } = useApplication();
  const [failed, setFailed] = useState(false);
  const colors = brand.theme.colors;
  const imageStyle =
    variant === 'detail'
      ? styles.detailImage
      : variant === 'cart'
      ? styles.cartImage
      : styles.productImage;
  const compact = variant === 'cart';

  if (failed) {
    return (
      <View
        accessible
        accessibilityLabel={services.i18n.t(
          'commerce.productImage.loadFailed.accessibilityLabel',
          { name: product.name },
        )}
        accessibilityRole="image"
        style={[
          imageStyle,
          styles.imageFallback,
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}
      >
        {compact ? null : (
          <Text
            numberOfLines={1}
            style={[styles.imageFallbackCategory, { color: colors.primary }]}
          >
            {product.category}
          </Text>
        )}
        <Text
          numberOfLines={2}
          style={[
            styles.imageFallbackText,
            compact && styles.imageFallbackTextCompact,
            { color: colors.textMuted },
          ]}
        >
          {services.i18n.t(
            compact
              ? 'commerce.productImage.unavailable.compact'
              : 'commerce.productImage.unavailable',
          )}
        </Text>
      </View>
    );
  }

  return (
    <Image
      accessibilityLabel={services.i18n.t(
        'commerce.productImage.accessibilityLabel',
        { name: product.name },
      )}
      accessibilityRole="image"
      onError={() => setFailed(true)}
      resizeMode="cover"
      source={{ uri: product.imageUrl }}
      style={imageStyle}
    />
  );
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
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
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
          opacity: disabled ? 0.75 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.primaryButtonText,
          disabled
            ? { color: colors.textMuted }
            : styles.primaryButtonTextEnabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function QuantityButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  onPress(): void;
}): React.JSX.Element {
  const { brand } = useApplication();
  const colors = brand.theme.colors;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quantityButton,
        {
          backgroundColor: pressed ? colors.background : colors.surface,
          borderColor: pressed ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.quantityButtonText, { color: colors.text }]}>
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
        accessible={false}
        style={[
          styles.emptyIcon,
          { color: success ? colors.success : colors.primary },
        ]}
      >
        {success ? '✓' : '◇'}
      </Text>
      <Text
        accessibilityRole="header"
        style={[styles.emptyTitle, { color: colors.text }]}
      >
        {title}
      </Text>
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
    paddingTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageHeaderCopy: { flex: 1, paddingRight: 12 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.7,
    marginBottom: 6,
  },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '600' },
  noticePanel: {
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  notice: { fontSize: 12, lineHeight: 18 },
  cartNotice: { marginTop: 6 },
  cartPill: {
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartPillText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  productListContainer: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  productList: { paddingTop: 16, paddingBottom: 32 },
  productRow: { gap: 12 },
  productCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  productImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#F0F2F5',
  },
  imageFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  imageFallbackCategory: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    marginBottom: 3,
    textAlign: 'center',
  },
  imageFallbackText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  imageFallbackTextCompact: { fontSize: 10, lineHeight: 14 },
  productCategory: { fontSize: 11, fontWeight: '600', marginTop: 10 },
  productName: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    marginTop: 4,
    minHeight: 42,
  },
  price: { fontSize: 15, fontWeight: '600', marginTop: 8 },
  detailContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 44 },
  backButton: {
    minHeight: 40,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginBottom: 16,
  },
  back: { fontSize: 14, fontWeight: '600' },
  detailImage: {
    width: '100%',
    aspectRatio: 1.3,
    borderRadius: 12,
    backgroundColor: '#F0F2F5',
  },
  detailTitle: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '600',
    marginTop: 8,
  },
  detailSubtitle: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  detailPrice: { fontSize: 24, fontWeight: '600', marginTop: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 24 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 10,
  },
  description: { fontSize: 15, lineHeight: 24 },
  stock: { fontSize: 12, fontWeight: '500', marginTop: 14 },
  primaryButton: {
    minHeight: 44,
    borderRadius: 8,
    marginTop: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactButton: { marginTop: 0, minWidth: 122 },
  primaryButtonText: { fontSize: 14, fontWeight: '600' },
  primaryButtonTextEnabled: { color: '#FFFFFF' },
  cartContent: { padding: 20, paddingBottom: 30 },
  cartLine: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    marginTop: 12,
  },
  cartImage: {
    width: 88,
    height: 88,
    borderRadius: 8,
    backgroundColor: '#F0F2F5',
  },
  cartLineCopy: { flex: 1, marginLeft: 14 },
  cartLineName: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  quantityButton: {
    width: 40,
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonText: { fontSize: 18, fontWeight: '500' },
  quantity: { width: 40, textAlign: 'center', fontSize: 14, fontWeight: '600' },
  cartFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: { fontSize: 12 },
  total: { fontSize: 22, fontWeight: '600', marginTop: 2 },
  checkoutContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  summaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 20,
  },
  summaryRow: {
    minHeight: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '500' },
  summaryValueStrong: { fontSize: 20, fontWeight: '600' },
  provider: {
    minHeight: 60,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  providerDisabled: { opacity: 0.55 },
  providerIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wechatIcon: { backgroundColor: '#07C160' },
  alipayIcon: { backgroundColor: '#1677FF' },
  providerIconText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  providerName: { flex: 1, fontSize: 15, fontWeight: '600', marginLeft: 12 },
  radio: { fontSize: 18 },
  paymentMessage: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  checkButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkButtonText: { fontSize: 14, fontWeight: '600' },
  securityNote: {
    fontSize: 12,
    lineHeight: 19,
    marginTop: 18,
  },
  empty: {
    flex: 1,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: { fontSize: 42, fontWeight: '300', marginBottom: 12 },
  emptyTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
});
