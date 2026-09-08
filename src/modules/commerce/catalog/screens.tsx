import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation, useRouteParams } from '../../../app/navigation';
import { CartStore, useCart } from '../CartStore';
import { formatMoney } from '../catalog';
import type { CommerceRepository } from '../repository';
import { EmptyState, PrimaryButton, ProductImage } from '../shared/ui';
import { useProduct, useProducts } from '../useProducts';
function useProductGridLayout() {
  const { width } = useWindowDimensions();
  const columns = width >= 768 ? 3 : 2;
  const listWidth = Math.min(width, 1080);
  const padding = width >= 768 ? 32 : 20;

  return {
    columns,
    padding,
    cardWidth:
      (listWidth - padding * 2 - styles.productRow.gap * (columns - 1)) /
      columns,
  };
}

export function createCatalogScreens(
  repository: Pick<CommerceRepository, 'listProducts' | 'getProduct'>,
  cart: CartStore,
) {
  function ProductListScreen(): React.JSX.Element {
    const { brand, locale, services } = useApplication();
    const navigate = useAppNavigation();
    const snapshot = useCart(cart);
    const layout = useProductGridLayout();
    const catalog = useProducts(repository, services.monitor);
    const colors = brand.theme.colors;

    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View
          style={[styles.pageHeader, { paddingHorizontal: layout.padding }]}
        >
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
        {catalog.error && catalog.products.length > 0 ? (
          <View
            style={[
              styles.catalogNoticeContainer,
              { paddingHorizontal: layout.padding },
            ]}
          >
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
                {services.i18n.t('commerce.products.notice.syncFailed')}
              </Text>
              <PrimaryButton
                label={services.i18n.t('commerce.products.refresh')}
                onPress={catalog.refresh}
                disabled={catalog.refreshing}
                compact
              />
            </View>
          </View>
        ) : null}
        <FlatList
          key={`product-grid-${layout.columns}`}
          data={catalog.products}
          keyExtractor={product => product.id}
          numColumns={layout.columns}
          style={styles.productListContainer}
          columnWrapperStyle={styles.productRow}
          contentContainerStyle={[
            styles.productList,
            { paddingHorizontal: layout.padding },
          ]}
          refreshing={catalog.refreshing}
          onRefresh={catalog.refresh}
          onEndReached={catalog.error ? undefined : catalog.loadMore}
          onEndReachedThreshold={0.3}
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
                })
              }
              style={({ pressed }) => [
                styles.productCard,
                {
                  width: layout.cardWidth,
                  backgroundColor: colors.surface,
                  borderColor: pressed ? colors.primary : colors.border,
                },
              ]}
            >
              <ProductImage product={item} variant="card" />
              <Text
                numberOfLines={1}
                style={[styles.productCategory, { color: colors.primary }]}
              >
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
          ListEmptyComponent={<ProductListEmpty catalog={catalog} />}
          ListFooterComponent={<ProductListFooter catalog={catalog} />}
        />
      </View>
    );
  }

  function ProductDetailScreen(): React.JSX.Element {
    const { brand, locale, services } = useApplication();
    const navigate = useAppNavigation();
    const { productId } = useRouteParams();
    const { product, loading, error, retry } = useProduct(
      repository,
      services.monitor,
      productId,
    );
    const [addedProductId, setAddedProductId] = useState<string>();
    const colors = brand.theme.colors;

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
        <View style={[styles.screen, { backgroundColor: colors.background }]}>
          {error ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => navigate('CommerceProducts')}
              style={styles.errorBackButton}
            >
              <Text style={[styles.back, { color: colors.primary }]}>
                ← {services.i18n.t('commerce.detail.backToProducts')}
              </Text>
            </Pressable>
          ) : null}
          <EmptyState
            title={services.i18n.t(
              error
                ? 'commerce.detail.loadFailed'
                : 'commerce.detail.notFound.title',
            )}
            action={services.i18n.t(
              error ? 'commerce.retry' : 'commerce.detail.backToProducts',
            )}
            onAction={error ? retry : () => navigate('CommerceProducts')}
          />
        </View>
      );
    }

    const addToCart = (): void => {
      if (product.inventory === 0) {
        return;
      }
      cart.add(product);
      setAddedProductId(product.id);
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
        {product.subtitle ? (
          <Text style={[styles.detailSubtitle, { color: colors.textMuted }]}>
            {product.subtitle}
          </Text>
        ) : null}
        <Text style={[styles.detailPrice, { color: colors.text }]}>
          {formatMoney(product.priceMinor, product.currency, locale)}
        </Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {services.i18n.t('commerce.detail.descriptionTitle')}
        </Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          {product.description ||
            services.i18n.t('commerce.detail.noDescription')}
        </Text>
        {product.inventory !== null ? (
          <Text style={[styles.stock, { color: colors.textMuted }]}>
            {services.i18n.t('commerce.detail.stock', {
              count: product.inventory,
            })}
          </Text>
        ) : null}
        <PrimaryButton
          label={services.i18n.t(
            addedProductId === product.id
              ? 'commerce.detail.addedToCart'
              : 'commerce.detail.addToCart',
          )}
          onPress={
            addedProductId === product.id
              ? () => navigate('CommerceCart')
              : addToCart
          }
          disabled={product.inventory === 0}
        />
      </ScrollView>
    );
  }

  return { ProductListScreen, ProductDetailScreen };
}
function ProductListEmpty({
  catalog,
}: {
  catalog: ReturnType<typeof useProducts>;
}): React.JSX.Element {
  const { brand, services } = useApplication();
  if (catalog.loading || catalog.refreshing) {
    return (
      <ActivityIndicator
        accessibilityLabel={services.i18n.t('commerce.products.loading')}
        accessibilityRole="progressbar"
        color={brand.theme.colors.primary}
        style={styles.catalogLoading}
      />
    );
  }
  return (
    <EmptyState
      title={services.i18n.t(
        catalog.error
          ? 'commerce.products.loadFailed'
          : 'commerce.products.empty.title',
      )}
      description={services.i18n.t(
        catalog.error
          ? 'commerce.products.loadFailed.description'
          : 'commerce.products.empty.description',
      )}
      action={services.i18n.t(
        catalog.error ? 'commerce.retry' : 'commerce.products.refresh',
      )}
      onAction={catalog.refresh}
    />
  );
}

function ProductListFooter({
  catalog,
}: {
  catalog: ReturnType<typeof useProducts>;
}): React.JSX.Element | null {
  const { brand, services } = useApplication();
  if (!catalog.hasMore || catalog.products.length === 0) {
    return null;
  }
  return (
    <View style={styles.catalogFooter}>
      {catalog.loadingMore ? (
        <ActivityIndicator
          accessibilityLabel={services.i18n.t('commerce.products.loading')}
          accessibilityRole="progressbar"
          color={brand.theme.colors.primary}
        />
      ) : (
        <PrimaryButton
          label={services.i18n.t('commerce.products.loadMore')}
          onPress={catalog.loadMore}
          disabled={catalog.refreshing}
          compact
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loading: { flex: 1 },
  catalogLoading: { paddingVertical: 64 },
  catalogFooter: { alignItems: 'center', paddingVertical: 16 },
  pageHeader: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
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
  catalogNoticeContainer: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
  },
  noticePanel: {
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
    justifyContent: 'center',
  },
  notice: { fontSize: 12, lineHeight: 18 },
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
  productList: { flexGrow: 1, paddingTop: 16, paddingBottom: 32 },
  productRow: { gap: 12 },
  productCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  productCategory: { fontSize: 11, fontWeight: '600', marginTop: 10 },
  productName: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    marginTop: 4,
    minHeight: 42,
  },
  price: { fontSize: 15, fontWeight: '600', marginTop: 8 },
  detailContent: {
    width: '100%',
    maxWidth: 768,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 44,
  },
  errorBackButton: { paddingHorizontal: 20, paddingVertical: 16 },
  backButton: {
    minHeight: 40,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginBottom: 16,
  },
  back: { fontSize: 14, fontWeight: '600' },
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
});
