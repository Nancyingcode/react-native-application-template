import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation, useRouteParams } from '../../../app/navigation';
import type { SkuCartStore } from '../cart/SkuCartStore';
import type { CouponSelectionProps } from '../coupons/contracts';
import { EmptyState, PrimaryButton } from '../shared/ui';
import { ShippingAddressForm } from './ShippingAddressForm';
import type { CheckoutPort, PricingSummary } from './contracts';
import { pricingFields } from './api';
import { useCheckout } from './useCheckout';

export function createSkuCheckoutScreen(
  checkout: CheckoutPort,
  cart: SkuCartStore,
  CouponSelector: React.ComponentType<CouponSelectionProps>,
) {
  return function CheckoutScreen(): React.JSX.Element {
    const { snapshotId = '' } = useRouteParams();
    const owner = cart.getSnapshot().owner;
    return (
      <CheckoutContent
        key={`${owner.generation}:${snapshotId}`}
        checkout={checkout}
        cart={cart}
        snapshotId={snapshotId}
        CouponSelector={CouponSelector}
      />
    );
  };
}
function CheckoutContent({
  checkout,
  cart,
  snapshotId,
  CouponSelector,
}: {
  checkout: CheckoutPort;
  cart: SkuCartStore;
  snapshotId: string;
  CouponSelector: React.ComponentType<CouponSelectionProps>;
}): React.JSX.Element {
  const { brand, services } = useApplication();
  const navigate = useAppNavigation();
  const t = services.i18n.t.bind(services.i18n);
  const colors = brand.theme.colors;
  const state = useCheckout(checkout, cart, snapshotId, t);
  if (!state.validSnapshot) {
    return (
      <EmptyState
        title={t('commerce.checkout.snapshotExpired')}
        description={t('commerce.checkout.snapshotHelp')}
        action={t('commerce.checkout.backToCart')}
        onAction={() => navigate('CommerceCart')}
      />
    );
  }
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.page,
        { backgroundColor: colors.background },
      ]}
    >
      <View style={styles.content}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {t('commerce.checkout.title')}
        </Text>
        <Text style={{ color: colors.textMuted }}>
          {t('commerce.checkout.snapshotSummary', {
            count:
              state.snapshot?.items.reduce(
                (total, item) => total + item.quantity,
                0,
              ) ?? 0,
          })}
        </Text>
        <Text
          accessibilityRole="header"
          style={[styles.heading, { color: colors.text }]}
        >
          {t('commerce.checkout.shippingTitle')}
        </Text>
        <ShippingAddressForm
          value={state.address}
          errors={state.errors}
          disabled={state.busy}
          onChange={state.setAddress}
        />
        <Text
          accessibilityRole="header"
          style={[styles.heading, { color: colors.text }]}
        >
          {t('commerce.checkout.couponTitle')}
        </Text>
        <CouponSelector
          value={state.couponId ? { couponId: state.couponId } : null}
          disabled={state.busy}
          onChange={value => state.selectCoupon(value?.couponId)}
        />
        <Text style={{ color: colors.textMuted }}>
          {t('commerce.checkout.couponHelp')}
        </Text>
        <PrimaryButton
          label={t(
            state.busy
              ? 'commerce.checkout.previewing'
              : 'commerce.checkout.preview',
          )}
          disabled={state.busy}
          onPress={state.preview}
        />
        {Object.keys(state.errors).length > 0 ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {t('commerce.checkout.address.reviewErrors')}
          </Text>
        ) : null}
        {state.error ? (
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            {t(state.error)}
          </Text>
        ) : null}
        {state.changed ? (
          <Text accessibilityRole="alert" style={{ color: colors.warning }}>
            {t('commerce.checkout.priceChanged')}
          </Text>
        ) : null}
        {state.pricing ? <PricingDetails pricing={state.pricing} /> : null}
        <Text
          accessibilityRole="alert"
          style={[
            styles.notice,
            { color: colors.text, borderColor: colors.border },
          ]}
        >
          {t('commerce.checkout.amountUnconfirmed')}
        </Text>
        <PrimaryButton
          label={t('commerce.checkout.submit')}
          disabled
          onPress={() => undefined}
        />
        <Text style={{ color: colors.textMuted }}>
          {t('commerce.checkout.shippingUnconfirmed')}
        </Text>
        <Pressable
          accessibilityRole="button"
          style={styles.back}
          onPress={() => navigate('CommerceCart')}
        >
          <Text style={{ color: colors.primary }}>
            {t('commerce.checkout.backToCart')}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
function PricingDetails({
  pricing,
}: {
  pricing: PricingSummary;
}): React.JSX.Element {
  const { brand, services } = useApplication();
  const colors = brand.theme.colors;
  return (
    <View style={[styles.pricing, { borderColor: colors.border }]}>
      <Text
        accessibilityRole="header"
        style={[styles.heading, { color: colors.text }]}
      >
        {services.i18n.t('commerce.checkout.pricingTitle')}
      </Text>
      {pricingFields.map(field => (
        <View key={field} style={styles.row}>
          <Text style={[styles.amountLabel, { color: colors.textMuted }]}>
            {services.i18n.t(`commerce.checkout.pricing.${field}`)}
          </Text>
          <Text selectable style={[styles.amount, { color: colors.text }]}>
            {pricing[field]}
          </Text>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  back: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  page: { flexGrow: 1, padding: 24 },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 16 },
  title: { fontSize: 28, fontWeight: '600' },
  heading: { fontSize: 18, fontWeight: '600' },
  notice: { borderWidth: 1, borderRadius: 8, padding: 16, lineHeight: 22 },
  pricing: { borderTopWidth: 1, paddingTop: 24, gap: 12 },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  amountLabel: { flexShrink: 1 },
  amount: { flexShrink: 1, fontVariant: ['tabular-nums'] },
});
