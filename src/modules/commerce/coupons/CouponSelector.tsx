import React from 'react';
import { Text, View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import type { CouponSelectionProps } from './contracts';
import { CouponCard, CouponOption, CouponQueryState, styles } from './ui';
import { useCoupons } from './useCoupons';

export function CouponSelector({
  value,
  disabled = false,
  onChange,
}: CouponSelectionProps): React.JSX.Element {
  const { brand, services } = useApplication();
  const query = useCoupons('available');
  const t = services.i18n.t.bind(services.i18n);
  const selectable = query.items.filter(
    coupon => coupon.status === 'AVAILABLE' && !coupon.unavailableReason,
  );
  const invalidSelection =
    value !== null &&
    !query.loading &&
    !query.error &&
    !selectable.some(coupon => coupon.id === value.couponId);
  return (
    <View style={styles.feedback}>
      <Text
        accessibilityRole="header"
        style={[styles.name, { color: brand.theme.colors.text }]}
      >
        {t('commerce.coupons.select')}
      </Text>
      <Text style={{ color: brand.theme.colors.textMuted }}>
        {t('commerce.coupons.applicability')}
      </Text>
      <CouponOption
        label={t('commerce.coupons.none')}
        selected={value === null}
        disabled={disabled}
        onPress={() => onChange(null)}
      />
      <CouponQueryState query={query} />
      {invalidSelection ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: brand.theme.colors.text }}
        >
          {t('commerce.coupons.invalidSelection')}
        </Text>
      ) : null}
      {query.items.map(coupon => (
        <CouponCard key={coupon.id} coupon={coupon}>
          <CouponOption
            label={
              t(
                value?.couponId === coupon.id
                  ? 'commerce.coupons.selected'
                  : 'commerce.coupons.select',
              ) +
              ': ' +
              coupon.name
            }
            selected={value?.couponId === coupon.id}
            disabled={disabled || !selectable.includes(coupon)}
            onPress={() => onChange({ couponId: coupon.id })}
          />
        </CouponCard>
      ))}
    </View>
  );
}
