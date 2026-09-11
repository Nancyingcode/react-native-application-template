import React, { useEffect, useState, useSyncExternalStore } from 'react';
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
import { PrimaryButton } from '../shared/ui';
import { AfterSalesStore, type ApplicationIntent } from './AfterSalesStore';
import { parseAfterSaleEntry } from './validation';

export function createAfterSaleScreen(store: AfterSalesStore) {
  return function CommerceAfterSaleScreen() {
    const params = useRouteParams();
    const routeKey = JSON.stringify([
      params.orderId,
      params.orderItemId,
      params.quantity,
    ]);
    return <AfterSaleScreen key={routeKey} store={store} />;
  };
}

function AfterSaleScreen({ store }: { store: AfterSalesStore }) {
  const { brand, services } = useApplication();
  const params = useRouteParams();
  const navigate = useAppNavigation();
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const { orderId, orderItemId, quantity } = params;
  const [flow, setFlow] = useState<'refund' | 'afterSale'>('refund');
  const [returnGoods, setReturnGoods] = useState(false);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [review, setReview] = useState<ApplicationIntent>();
  const [focused, setFocused] = useState<string>();
  const colors = brand.theme.colors;
  const t = (key: string) => services.i18n.t(`commerce.afterSales.${key}`);

  useEffect(
    () => store.open(parseAfterSaleEntry({ orderId, orderItemId, quantity })),
    [store, orderId, orderItemId, quantity],
  );

  function prepare() {
    if (!state.entry || !reason.trim()) {
      return;
    }
    const input = {
      orderId: state.entry.orderId,
      items: [
        {
          orderItemId: state.entry.orderItemId,
          quantity: state.entry.quantity,
        },
      ],
      reason: reason.trim(),
    };
    if (flow === 'refund') {
      setReview({
        flow,
        input: {
          ...input,
          type: returnGoods ? 'RETURN_AND_REFUND' : 'REFUND_ONLY',
        },
      });
    } else {
      setReview({
        flow,
        input: {
          ...input,
          type: returnGoods ? 'RETURN_REFUND' : 'REFUND_ONLY',
          ...(description.trim() ? { description: description.trim() } : {}),
        },
      });
    }
  }
  const busy = ['loading', 'checking', 'submitting'].includes(state.phase);
  const editable = state.phase === 'ready' && !review;
  const refundQuantityInvalid = flow === 'refund' && Number(quantity) > 999;
  const showForm =
    state.phase === 'ready' ||
    state.phase === 'checking' ||
    (state.phase === 'submitting' && review !== undefined);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
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
        {state.entry && state.phase !== 'signedOut' ? (
          <View
            style={[
              styles.summary,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Text selectable style={[styles.body, { color: colors.text }]}>
              {t('order')}：{state.entry.orderId}
            </Text>
            <Text selectable style={[styles.body, { color: colors.textMuted }]}>
              {t('item')}：{state.entry.orderItemId}
            </Text>
            <Text style={[styles.body, { color: colors.text }]}>
              {t('quantity')}：{state.entry.quantity}
            </Text>
            {state.orderStatus ? (
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {t('orderStatus')}：{state.orderStatus}
              </Text>
            ) : null}
          </View>
        ) : null}
        {busy ? (
          <View accessibilityLiveRegion="polite" style={styles.section}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.body, { color: colors.text }]}>
              {t(state.phase)}
            </Text>
          </View>
        ) : null}
        {showForm ? (
          <>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: colors.text }]}
            >
              {t('flow')}
            </Text>
            <View style={styles.choices}>
              <Choice
                label={t('refund')}
                selected={flow === 'refund'}
                disabled={!editable}
                onPress={() => setFlow('refund')}
              />
              <Choice
                label={t('afterSale')}
                selected={flow === 'afterSale'}
                disabled={!editable}
                onPress={() => setFlow('afterSale')}
              />
            </View>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              {t(`${flow}Hint`)}
            </Text>
            <Text style={[styles.heading, { color: colors.text }]}>
              {t('type')}
            </Text>
            <View style={styles.choices}>
              <Choice
                label={t('refundOnly')}
                selected={!returnGoods}
                disabled={!editable}
                onPress={() => setReturnGoods(false)}
              />
              <Choice
                label={t('returnRefund')}
                selected={returnGoods}
                disabled={!editable}
                onPress={() => setReturnGoods(true)}
              />
            </View>
            <Text style={[styles.heading, { color: colors.text }]}>
              {t('reason')}
            </Text>
            <TextInput
              accessibilityLabel={t('reason')}
              value={reason}
              onChangeText={setReason}
              editable={editable}
              multiline
              onFocus={() => setFocused('reason')}
              onBlur={() => setFocused(undefined)}
              style={[
                styles.input,
                {
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderColor:
                    focused === 'reason' ? colors.primary : colors.border,
                },
              ]}
            />
            {flow === 'afterSale' ? (
              <>
                <Text style={[styles.heading, { color: colors.text }]}>
                  {t('description')}
                </Text>
                <TextInput
                  accessibilityLabel={t('description')}
                  value={description}
                  onChangeText={setDescription}
                  editable={editable}
                  multiline
                  onFocus={() => setFocused('description')}
                  onBlur={() => setFocused(undefined)}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: colors.surface,
                      borderColor:
                        focused === 'description'
                          ? colors.primary
                          : colors.border,
                    },
                  ]}
                />
              </>
            ) : null}
            {refundQuantityInvalid ? (
              <Text
                accessibilityRole="alert"
                style={[styles.body, { color: colors.danger }]}
              >
                {t('refundQuantity')}
              </Text>
            ) : null}
            {review ? (
              <View style={styles.section}>
                <Text
                  accessibilityRole="header"
                  style={[styles.heading, { color: colors.text }]}
                >
                  {t('review')}
                </Text>
                <Text style={[styles.body, { color: colors.textMuted }]}>
                  {t('confirmHint')}
                </Text>
                <PrimaryButton
                  label={t('confirm')}
                  disabled={busy}
                  onPress={() => {
                    store.submit(review);
                  }}
                />
                <Choice
                  label={t('edit')}
                  disabled={busy}
                  selected={false}
                  onPress={() => setReview(undefined)}
                />
              </View>
            ) : (
              <PrimaryButton
                label={t('review')}
                disabled={!editable || !reason.trim() || refundQuantityInvalid}
                onPress={prepare}
              />
            )}
          </>
        ) : null}
        {state.phase === 'success' ? (
          <View accessibilityLiveRegion="polite" style={styles.section}>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: colors.success }]}
            >
              {t('received')}
            </Text>
            <Text selectable style={[styles.body, { color: colors.text }]}>
              {t('applicationId')}：{state.result?.id}
            </Text>
            <Text selectable style={[styles.body, { color: colors.text }]}>
              {t('status')}：{state.result?.status}
            </Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              {t('progressUnavailable')}
            </Text>
          </View>
        ) : null}
        {state.phase === 'unknown' || state.phase === 'conflict' ? (
          <View accessibilityLiveRegion="polite" style={styles.section}>
            <Text
              accessibilityRole="alert"
              style={[styles.heading, { color: colors.text }]}
            >
              {t(state.phase)}
            </Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              {t('unknownHint')}
            </Text>
            {state.phase === 'unknown' && state.intent?.flow === 'refund' ? (
              <PrimaryButton
                label={t('retryRefund')}
                onPress={() => {
                  store.retryRefund();
                }}
              />
            ) : null}
          </View>
        ) : null}
        {state.phase === 'error' || state.phase === 'signedOut' ? (
          <View style={styles.section}>
            <Text
              accessibilityRole="alert"
              style={[styles.body, { color: colors.danger }]}
            >
              {t(state.error ?? 'signedOut')}
            </Text>
            {state.entry ? (
              <PrimaryButton
                label={t('reload')}
                onPress={() => {
                  setReview(undefined);
                  store.reload();
                }}
              />
            ) : null}
          </View>
        ) : null}
        {state.requestId ? (
          <Text selectable style={[styles.body, { color: colors.textMuted }]}>
            {t('requestId')}：{state.requestId}
          </Text>
        ) : null}
        <View style={styles.section}>
          <Choice
            label={t('back')}
            selected={false}
            onPress={() => navigate('CommerceOrders')}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function Choice({
  label,
  selected,
  disabled = false,
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
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: colors.surface,
          opacity: pressed || disabled ? 0.65 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.body,
          { color: selected ? colors.primary : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 24 },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 12 },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '600' },
  heading: { fontSize: 16, lineHeight: 24, fontWeight: '600', marginTop: 12 },
  body: { fontSize: 14, lineHeight: 22, flexShrink: 1 },
  summary: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    gap: 8,
    marginTop: 12,
  },
  section: { gap: 12, marginTop: 16 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  choice: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: 'center',
  },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlignVertical: 'top',
  },
});
