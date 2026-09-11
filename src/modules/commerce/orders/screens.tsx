import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation, useRouteParams } from '../../../app/navigation';
import type { SessionManager } from '../../../core/auth';
import { PrimaryButton } from '../shared/ui';
import {
  orderStatuses,
  type OrderFilter,
  type OrdersRepository,
} from './repository';
import { useOrders } from './useOrders';
import type { OrderResponseDto } from './types';

function useOrderText() {
  const { services } = useApplication();
  return (key: string) => {
    const unknownStatus =
      key.startsWith('status.') &&
      !orderStatuses.some(status => key === `status.${status}`);
    if (unknownStatus) {
      return `${services.i18n.t('commerce.orders.unconfirmed')} (${key.slice(
        7,
      )})`;
    }
    return services.i18n.t(`commerce.orders.${key}`);
  };
}

function Copy({
  children,
  heading = false,
}: React.PropsWithChildren<{ heading?: boolean }>) {
  const { brand } = useApplication();
  return (
    <Text
      accessibilityRole={heading ? 'header' : undefined}
      style={[
        heading ? styles.heading : styles.text,
        { color: brand.theme.colors.text },
      ]}
    >
      {children}
    </Text>
  );
}
function Action({
  label,
  onPress,
  disabled = false,
  selected = false,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const { brand } = useApplication();
  const colors = brand.theme.colors;
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.action,
        {
          borderColor: selected || focused ? colors.primary : colors.border,
          backgroundColor: pressed ? colors.background : colors.surface,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={{ color: selected ? colors.primary : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}
function Panel({ children }: React.PropsWithChildren) {
  const { brand } = useApplication();
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: brand.theme.colors.surface,
          borderColor: brand.theme.colors.border,
        },
      ]}
    >
      {children}
    </View>
  );
}
function OrderContent({
  order,
  disabled,
}: {
  order: OrderResponseDto;
  disabled: boolean;
}) {
  const navigate = useAppNavigation();
  const t = useOrderText();
  const afterSale = [
    'PAID',
    'PROCESSING',
    'SHIPPED',
    'COMPLETED',
    'PARTIALLY_REFUNDED',
  ].includes(order.status);
  const amounts = [
    'originalAmount',
    'subtotalAmount',
    'promotionDiscountAmount',
    'couponDiscountAmount',
    'discountAmount',
    'shippingAmount',
    'shippingDiscountAmount',
    'taxAmount',
    'totalAmount',
    'payableAmount',
    'paidAmount',
    'refundedAmount',
  ] as const;
  return (
    <>
      <Panel>
        <Copy heading>{order.orderNo}</Copy>
        <Copy>{t(`status.${order.status}`)}</Copy>
        <Copy>
          {t('paymentStatus')}: {order.paymentStatus ?? t('unconfirmed')}
        </Copy>
        <Copy>{order.createdAt}</Copy>
      </Panel>
      <Panel>
        <Copy heading>{t('items')}</Copy>
        {order.items.map(item => (
          <View key={item.id} style={styles.section}>
            <Copy heading>{item.productName}</Copy>
            <Copy>
              {item.skuName} · {item.skuCode} × {item.quantity}
            </Copy>
            <Copy>
              {t('rawAmount')}: {item.finalAmount} ({order.currency})
            </Copy>
            {afterSale &&
            Number.isSafeInteger(item.quantity) &&
            item.quantity > 0 ? (
              <Action
                label={`${t('afterSale')} · ${item.productName}`}
                disabled={disabled}
                onPress={() =>
                  navigate('CommerceAfterSale', {
                    orderId: order.id,
                    orderItemId: item.id,
                    quantity: String(item.quantity),
                  })
                }
              />
            ) : null}
          </View>
        ))}
      </Panel>
      <Panel>
        <Copy heading>{t('amounts')}</Copy>
        <Copy>{t('amountUnknown')}</Copy>
        {amounts.map(field => (
          <Copy key={field}>
            {t(field)}: {order[field]} ({order.currency})
          </Copy>
        ))}
      </Panel>
      <Panel>
        <Copy heading>{t('shipping')}</Copy>
        <Copy>
          {order.shippingAddress.recipient} · {order.shippingAddress.phone}
        </Copy>
        <Copy>
          {[
            order.shippingAddress.province,
            order.shippingAddress.city,
            order.shippingAddress.district,
            order.shippingAddress.addressLine,
            order.shippingAddress.postalCode,
          ]
            .filter(Boolean)
            .join(' ')}
        </Copy>
      </Panel>
      <Panel>
        <Copy heading>{t('timeline')}</Copy>
        {order.statusTimeline.length ? (
          order.statusTimeline.map(log => (
            <View key={log.id} style={styles.section}>
              <Copy>{t(`status.${log.toStatus}`)}</Copy>
              <Copy>{log.createdAt}</Copy>
              {log.reason ? <Copy>{log.reason}</Copy> : null}
            </View>
          ))
        ) : (
          <Copy>{t('noTimeline')}</Copy>
        )}
      </Panel>
    </>
  );
}
export function createOrdersScreens(
  repository: OrdersRepository,
  session: SessionManager,
) {
  function OrderPage({ orderId }: { orderId?: string }) {
    const { brand } = useApplication();
    const navigate = useAppNavigation();
    const model = useOrders(repository, session, orderId);
    const [filter, setFilter] = useState<OrderFilter>({});
    const [inputFocused, setInputFocused] = useState(false);
    const [confirm, setConfirm] = useState<'cancel' | 'receipt' | null>(null);
    useEffect(() => {
      setConfirm(null);
    }, [model.order]);
    const t = useOrderText();
    const change = (next: OrderFilter) => {
      setFilter(next);
      model.load(next);
    };
    return (
      <ScrollView
        style={{ backgroundColor: brand.theme.colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Copy heading>{t(orderId === undefined ? 'title' : 'detail')}</Copy>
        <Action
          label={t('refresh')}
          disabled={model.busy}
          onPress={() => {
            setConfirm(null);
            model.load();
          }}
        />
        {orderId === undefined ? (
          <Panel>
            <Copy>{t('orderNo')}</Copy>
            <TextInput
              accessibilityLabel={t('orderNo')}
              value={filter.orderNo ?? ''}
              maxLength={40}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onSubmitEditing={() => change(filter)}
              onChangeText={orderNo => setFilter({ ...filter, orderNo })}
              style={[
                styles.input,
                {
                  color: brand.theme.colors.text,
                  borderColor: inputFocused
                    ? brand.theme.colors.primary
                    : brand.theme.colors.border,
                },
              ]}
            />
            <Action
              label={t('search')}
              disabled={model.busy}
              onPress={() => change(filter)}
            />
            <View style={styles.filters}>
              {[undefined, ...orderStatuses].map(status => (
                <Action
                  key={status ?? 'all'}
                  label={t(status ? `status.${status}` : 'all')}
                  selected={filter.status === status}
                  onPress={() => change({ ...filter, status })}
                />
              ))}
            </View>
          </Panel>
        ) : null}
        {model.busy ? (
          <ActivityIndicator
            accessibilityLabel={t('loading')}
            color={brand.theme.colors.primary}
          />
        ) : null}
        {model.error ? (
          <Text
            accessibilityRole="alert"
            style={{ color: brand.theme.colors.danger }}
          >
            {t(model.error)}
          </Text>
        ) : null}
        {orderId === undefined ? (
          <>
            {!model.busy && !model.items.length ? (
              <Copy>{t('empty')}</Copy>
            ) : null}
            {model.items.map(order => (
              <Panel key={order.id}>
                <Copy heading>{order.orderNo}</Copy>
                <Copy>{t(`status.${order.status}`)}</Copy>
                <Copy>{order.createdAt}</Copy>
                <Copy>
                  {t('rawAmount')}: {order.payableAmount} ({order.currency})
                </Copy>
                <Copy>{t('amountUnknown')}</Copy>
                <Action
                  label={`${t('detail')} · ${order.orderNo}`}
                  onPress={() =>
                    navigate('CommerceOrderDetail', { orderId: order.id })
                  }
                />
              </Panel>
            ))}
            {model.items.length < model.total ? (
              <Action
                label={t('more')}
                disabled={model.busy}
                onPress={() => {
                  model.load(undefined, true);
                }}
              />
            ) : null}
          </>
        ) : null}
        {model.order ? (
          <>
            <OrderContent order={model.order} disabled={model.busy} />
            {model.order.status === 'PENDING_PAYMENT' ? (
              <Action
                label={t('payment')}
                disabled={model.busy}
                onPress={() =>
                  navigate('CommercePayment', { orderId: model.order!.id })
                }
              />
            ) : null}
            {model.order.status === 'PENDING_PAYMENT' ? (
              <Action
                label={t('cancel')}
                disabled={model.busy || model.blocked}
                onPress={() => setConfirm('cancel')}
              />
            ) : null}
            {model.order.status === 'SHIPPED' ? (
              <Action
                label={t('receipt')}
                disabled={model.busy || model.blocked}
                onPress={() => setConfirm('receipt')}
              />
            ) : null}
            {confirm ? (
              <Panel>
                <Copy heading>
                  {t(confirm === 'cancel' ? 'confirmCancel' : 'confirmReceipt')}
                </Copy>
                <PrimaryButton
                  label={t('confirm')}
                  disabled={model.busy || model.blocked}
                  onPress={() => {
                    const action = confirm;
                    setConfirm(null);
                    model.mutate(action);
                  }}
                />
                <Action
                  label={t('back')}
                  disabled={model.busy}
                  onPress={() => setConfirm(null)}
                />
              </Panel>
            ) : null}
          </>
        ) : null}
        {orderId !== undefined ? (
          <Action
            label={t('title')}
            onPress={() => navigate('CommerceOrders')}
          />
        ) : null}
      </ScrollView>
    );
  }
  function OrdersScreen() {
    return <OrderPage />;
  }
  function OrderDetailScreen() {
    const { orderId } = useRouteParams();
    return <OrderPage key={orderId ?? ''} orderId={orderId ?? ''} />;
  }
  return { OrdersScreen, OrderDetailScreen };
}
const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 16,
    width: '100%',
    maxWidth: 880,
    alignSelf: 'center',
  },
  panel: { padding: 20, borderWidth: 1, borderRadius: 12, gap: 12 },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  text: { fontSize: 14, lineHeight: 22 },
  section: { gap: 8, paddingVertical: 8 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
  },
  input: { minHeight: 44, padding: 12, borderWidth: 1, borderRadius: 8 },
});
