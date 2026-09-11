import React, { useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { PrimaryButton } from '../shared/ui';
import { useCouponsClient } from './context';
import { CouponCard, styles } from './ui';

/** Only mount for a template supplied by a real campaign/product source. */
export function CouponClaim({
  couponTemplateId,
  name,
}: {
  couponTemplateId: string;
  name: string;
}) {
  const { services, brand } = useApplication();
  const client = useCouponsClient();
  useSyncExternalStore(client.subscribe, client.getGeneration);
  const operation = useSyncExternalStore(client.subscribe, () =>
    client.getClaim(couponTemplateId),
  );
  const t = services.i18n.t.bind(services.i18n);
  if (!couponTemplateId.trim()) {
    return null;
  }
  let label = 'claim';
  if (operation?.status === 'sending') {
    label = 'claiming';
  } else if (
    operation?.status === 'unknown' ||
    operation?.status === 'failed'
  ) {
    label = 'claimRetry';
  } else if (operation?.status === 'success') {
    label = 'claimSuccess';
  }
  return (
    <View style={styles.feedback}>
      <Text style={[styles.name, { color: brand.theme.colors.text }]}>
        {name}
      </Text>
      {operation?.status === 'unknown' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: brand.theme.colors.textMuted }}
        >
          {t('commerce.coupons.claimUnknown')}
        </Text>
      ) : null}
      {operation?.status === 'failed' ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: brand.theme.colors.danger }}
        >
          {t('commerce.coupons.claimFailed')}
        </Text>
      ) : null}
      {operation?.error ? (
        <Text style={{ color: brand.theme.colors.textMuted }}>
          {operation.error.message}
          {operation.error.requestId ? ` (${operation.error.requestId})` : ''}
        </Text>
      ) : null}
      {operation?.coupon ? <CouponCard coupon={operation.coupon} /> : null}
      <PrimaryButton
        compact
        label={t(`commerce.coupons.${label}`)}
        disabled={
          !client.isAuthenticated() ||
          operation?.status === 'sending' ||
          operation?.status === 'success'
        }
        onPress={() => {
          client.claim(couponTemplateId).catch(() => {
            /* The retained operation exposes the unconfirmed result. */
          });
        }}
      />
    </View>
  );
}
