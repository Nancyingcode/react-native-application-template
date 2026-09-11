import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { couponStatuses, type CouponStatus } from './repository';
import { CouponCard, CouponOption, CouponQueryState, styles } from './ui';
import { useCoupons } from './useCoupons';

export function CouponsScreen(): React.JSX.Element {
  const [status, setStatus] = useState<CouponStatus>();
  const query = useCoupons('my', status);
  const { services, brand } = useApplication();
  const t = services.i18n.t.bind(services.i18n);
  return (
    <ScrollView
      style={[
        styles.screen,
        { backgroundColor: brand.theme.colors.background },
      ]}
      contentContainerStyle={styles.content}
    >
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: brand.theme.colors.text }]}
      >
        {t('commerce.coupons.title')}
      </Text>
      <View style={styles.filters}>
        <CouponOption
          label={t('commerce.coupons.all')}
          selected={status === undefined}
          onPress={() => setStatus(undefined)}
        />
        {couponStatuses.map(option => (
          <CouponOption
            key={option}
            label={t(`commerce.coupons.${option}`)}
            selected={status === option}
            onPress={() => setStatus(option)}
          />
        ))}
      </View>
      <CouponQueryState query={query} />
      {query.items.map(coupon => (
        <CouponCard key={coupon.id} coupon={coupon} />
      ))}
    </ScrollView>
  );
}
