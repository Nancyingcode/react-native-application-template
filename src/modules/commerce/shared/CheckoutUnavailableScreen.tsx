import React from 'react';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation } from '../../../app/navigation';
import { EmptyState } from './ui';

// T6 的 SKU 结算尚未交付，不能将快照传给旧 productId 下单接口。
export function CheckoutUnavailableScreen(): React.JSX.Element {
  const { services } = useApplication();
  const navigate = useAppNavigation();
  return (
    <EmptyState
      title={services.i18n.t('commerce.checkout.unavailable.title')}
      description={services.i18n.t('commerce.checkout.unavailable.description')}
      action={services.i18n.t('commerce.checkout.unavailable.back')}
      onAction={() => navigate('CommerceCart')}
    />
  );
}
