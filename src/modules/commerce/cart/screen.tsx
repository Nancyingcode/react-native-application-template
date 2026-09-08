import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation } from '../../../app/navigation';
import { CartStore, useCart } from '../CartStore';
import { formatMoney, getDemoProducts, isDemoProduct } from '../catalog';
import { EmptyState, PrimaryButton, ProductImage } from '../shared/ui';
export function createCartScreen(cart: CartStore) {
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
          <View style={styles.cartFooterContent}>
            <View style={styles.cartTotal}>
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
      </View>
    );
  }

  return CartScreen;
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '600' },
  notice: { fontSize: 12, lineHeight: 18 },
  cartNotice: { marginTop: 6 },
  price: { fontSize: 15, fontWeight: '600', marginTop: 8 },
  cartContent: {
    width: '100%',
    maxWidth: 768,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 30,
  },
  cartLine: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    marginTop: 12,
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
    paddingVertical: 16,
  },
  cartFooterContent: {
    width: '100%',
    maxWidth: 768,
    alignSelf: 'center',
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartTotal: { flexShrink: 1 },
  totalLabel: { fontSize: 12 },
  total: { fontSize: 22, fontWeight: '600', marginTop: 2 },
});
