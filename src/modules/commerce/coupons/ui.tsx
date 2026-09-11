import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { PrimaryButton } from '../shared/ui';
import { couponStatuses, type UserCoupon } from './repository';
import type { useCoupons } from './useCoupons';

export function CouponOption({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress(): void;
}) {
  const { brand } = useApplication();
  const colors = brand.theme.colors;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: pressed ? colors.surface : colors.background,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <Text style={{ color: selected ? colors.primary : colors.text }}>
        {selected ? '● ' : '○ '}
        {label}
      </Text>
    </Pressable>
  );
}

export function CouponCard({
  coupon,
  children,
}: React.PropsWithChildren<{ coupon: UserCoupon }>) {
  const { brand, services, locale } = useApplication();
  const colors = brand.theme.colors;
  const t = services.i18n.t.bind(services.i18n);
  const knownStatus = couponStatuses.some(status => status === coupon.status);
  const knownType = ['CASH', 'FULL_REDUCTION', 'DISCOUNT', 'SHIPPING'].includes(
    coupon.type,
  );
  function date(value: string) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toLocaleString(locale)
      : t('commerce.coupons.dateUnknown');
  }
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        {t(`commerce.coupons.${knownType ? coupon.type : 'typeUnknown'}`)}
      </Text>
      <Text
        accessibilityRole="header"
        style={[styles.name, { color: colors.text }]}
      >
        {coupon.name}
      </Text>
      <Text style={{ color: colors.text }}>
        {t(`commerce.coupons.${knownStatus ? coupon.status : 'unknown'}`)}
      </Text>
      <Text style={[styles.caption, { color: colors.textMuted }]}>
        {t('commerce.coupons.validity', {
          from: date(coupon.validFrom),
          until: date(coupon.validUntil),
        })}
      </Text>
      {coupon.unavailableReason ? (
        <Text style={{ color: colors.textMuted }}>
          {coupon.unavailableReason}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function CouponQueryState({
  query,
}: {
  query: ReturnType<typeof useCoupons>;
}) {
  const { brand, services } = useApplication();
  let message: string | null = null;
  if (!query.authenticated) {
    message = 'login';
  } else if (query.loading) {
    message = 'loading';
  } else if (query.error) {
    message = 'error';
  } else if (query.items.length === 0) {
    message = 'empty';
  }
  return (
    <View style={styles.feedback}>
      {query.authenticated && query.loading ? (
        <ActivityIndicator color={brand.theme.colors.primary} />
      ) : null}
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: brand.theme.colors.textMuted }}
        >
          {services.i18n.t(`commerce.coupons.${message}`)}
        </Text>
      ) : null}
      {query.authenticated ? (
        <PrimaryButton
          compact
          label={services.i18n.t('commerce.coupons.refresh')}
          disabled={query.loading}
          onPress={query.refresh}
        />
      ) : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: 20,
    gap: 16,
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
  },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  name: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 20 },
  card: { padding: 20, borderWidth: 1, borderRadius: 12, gap: 8 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  feedback: { gap: 12 },
});
