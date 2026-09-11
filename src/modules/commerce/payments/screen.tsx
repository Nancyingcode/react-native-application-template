import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation, useRouteParams } from '../../../app/navigation';
import { PrimaryButton } from '../shared/ui';
import type { NewPaymentProvider } from './contracts';
import type { PaymentController, PaymentState } from './PaymentController';

export function createPaymentScreen(controller: PaymentController) {
  return function PaymentScreen(): React.JSX.Element {
    const { orderId = '' } = useRouteParams();
    const state = useSyncExternalStore(
      controller.subscribe,
      controller.getSnapshot,
    );
    useEffect(() => controller.enter(orderId), [orderId]);
    useEffect(() => {
      let previous = AppState.currentState;
      const subscription = AppState.addEventListener('change', next => {
        const returned = previous !== 'active' && next === 'active';
        previous = next;
        if (returned) {
          controller.check();
        }
      });
      return () => subscription.remove();
    }, []);
    // 路由切换到 effect 清理之间，不展示前一订单的数据。
    if (state.orderId !== orderId && state.message !== 'session') {
      return <ActivityIndicator />;
    }
    return (
      <PaymentContent key={orderId} state={state} controller={controller} />
    );
  };
}

function PaymentContent({
  state,
  controller,
}: {
  state: PaymentState;
  controller: PaymentController;
}): React.JSX.Element {
  const { brand, services } = useApplication();
  const navigate = useAppNavigation();
  const colors = brand.theme.colors;
  const t = (key: string) => services.i18n.t(`commerce.payment.v2.${key}`);
  const providers: NewPaymentProvider[] = (
    brand.commerce?.paymentProviders ?? []
  ).map(provider => (provider === 'wechat' ? 'WECHAT_PAY' : 'ALIPAY'));
  const [provider, setProvider] = useState<NewPaymentProvider | undefined>(
    providers[0],
  );
  const busy = state.phase === 'creating' || state.phase === 'checking';
  const canCreate =
    !!provider &&
    (state.phase === 'idle' || state.phase === 'unknown') &&
    !state.payment;
  const canQuery = !!state.payment && !busy && state.phase !== 'blocked';
  const createAction = state.hasOperation ? 'retryCreate' : 'create';
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
    >
      <View style={styles.content}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {t('title')}
        </Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          {t('intro')}
        </Text>
        {state.orderId ? (
          <Text
            selectable
            style={[styles.identifier, { color: colors.textMuted }]}
          >
            {t('order')}: {state.orderId}
          </Text>
        ) : null}
        <View
          style={[
            styles.panel,
            { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <Text
            accessibilityRole="header"
            style={[styles.heading, { color: colors.text }]}
          >
            {t('result')}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.status, { color: colors.text }]}
          >
            {t(statusKey(state))}
          </Text>
          {busy ? (
            <ActivityIndicator
              color={colors.primary}
              accessibilityLabel={t('loading')}
            />
          ) : null}
          {state.payment ? (
            <>
              <Text
                selectable
                style={[styles.identifier, { color: colors.textMuted }]}
              >
                {t('payment')}: {state.payment.paymentId}
              </Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {t('amountUnknown')}
              </Text>
            </>
          ) : null}
          {state.provider ? (
            <Text style={[styles.body, { color: colors.textMuted }]}>
              {t('provider')}: {t(state.provider)}
            </Text>
          ) : null}
          {state.message ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.body, { color: colors.textMuted }]}
            >
              {t(state.message)}
            </Text>
          ) : null}
        </View>
        {!state.hasOperation && state.phase === 'idle' ? (
          <View style={styles.providers}>
            <Text style={[styles.heading, { color: colors.text }]}>
              {t('provider')}
            </Text>
            {providers.map(value => (
              <ProviderChoice
                key={value}
                value={value}
                selected={provider === value}
                onSelect={() => setProvider(value)}
              />
            ))}
            {!providers.length ? (
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {t('noProvider')}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Text style={[styles.body, { color: colors.textMuted }]}>
          {t('launchBlocked')}
        </Text>
        {!state.payment && state.phase !== 'blocked' ? (
          <PrimaryButton
            compact
            label={t(busy ? 'loading' : createAction)}
            disabled={!canCreate || busy}
            onPress={() => {
              if (provider) {
                controller.create(provider);
              }
            }}
          />
        ) : null}
        {state.payment ? (
          <PrimaryButton
            compact
            label={t('check')}
            disabled={!canQuery}
            onPress={() => {
              controller.check();
            }}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('orders')}
          onPress={() => navigate('CommerceOrders')}
          style={({ pressed }) => [
            styles.back,
            { borderColor: colors.border, opacity: pressed ? 0.65 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: colors.primary }]}>
            {t('orders')}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function ProviderChoice({
  value,
  selected,
  onSelect,
}: {
  value: NewPaymentProvider;
  selected: boolean;
  onSelect(): void;
}): React.JSX.Element {
  const { brand, services } = useApplication();
  const colors = brand.theme.colors;
  const [focused, setFocused] = useState(false);
  const label = services.i18n.t(`commerce.payment.v2.${value}`);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onSelect}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.choice,
        {
          borderColor: selected || focused ? colors.primary : colors.border,
          backgroundColor: colors.surface,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: selected ? colors.primary : colors.text },
        ]}
      >
        {selected ? '● ' : '○ '}
        {label}
      </Text>
    </Pressable>
  );
}

export function statusKey(state: PaymentState): string {
  if (state.phase === 'creating' || state.phase === 'checking') {
    return state.phase;
  }
  if (state.phase === 'unknown' || state.phase === 'blocked') {
    return 'unconfirmed';
  }
  const status = state.payment?.status;
  if (!status) {
    return 'notCreated';
  }
  if (status === 'SUCCESS') {
    return 'success';
  }
  if (status === 'PENDING' || status === 'PROCESSING') {
    return 'pending';
  }
  if (status === 'EXPIRED') {
    return 'expired';
  }
  if (status === 'FAILED') {
    return 'failed';
  }
  return 'unconfirmed';
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 20 },
  content: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    gap: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '600' },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 22 },
  identifier: { fontSize: 12, lineHeight: 20 },
  panel: { padding: 24, borderWidth: 1, borderRadius: 12, gap: 16 },
  status: { fontSize: 20, lineHeight: 28, fontWeight: '500' },
  providers: { gap: 12 },
  choice: {
    minHeight: 48,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
  },
  buttonText: { fontSize: 14, lineHeight: 22, fontWeight: '500' },
  back: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
