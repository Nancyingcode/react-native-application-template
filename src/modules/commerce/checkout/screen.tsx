import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation } from '../../../app/navigation';
import { CartStore } from '../CartStore';
import { formatMoney } from '../catalog';
import { PaymentLauncher } from '../payment';
import { createUseCheckoutPayment } from '../payments/useCheckoutPayment';
import type { CommerceRepository } from '../repository';
import { EmptyState, PrimaryButton } from '../shared/ui';
export function createCheckoutScreen(
  repository: CommerceRepository,
  cart: CartStore,
  paymentLauncher: PaymentLauncher,
) {
  const useCheckoutPayment = createUseCheckoutPayment(
    repository,
    cart,
    paymentLauncher,
  );
  function CheckoutScreen(): React.JSX.Element {
    const { brand, locale, services } = useApplication();
    const navigate = useAppNavigation();
    const colors = brand.theme.colors;
    const {
      snapshot,
      providers,
      provider,
      setProvider,
      phase,
      paymentId,
      messageKey,
      busy,
      checkPayment,
      pay,
    } = useCheckoutPayment();
    if (phase === 'succeeded') {
      return (
        <EmptyState
          title={services.i18n.t('commerce.payment.success.title')}
          description={services.i18n.t('commerce.payment.success.description')}
          action={services.i18n.t('commerce.payment.success.action')}
          onAction={() => navigate('CommerceProducts')}
          success
        />
      );
    }

    return (
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.checkoutContent}
      >
        <Pressable
          accessibilityLabel={services.i18n.t('commerce.checkout.backToCart')}
          accessibilityRole="button"
          onPress={() => navigate('CommerceCart')}
          style={styles.backButton}
        >
          <Text style={[styles.back, { color: colors.primary }]}>
            ← {services.i18n.t('commerce.checkout.backToCart')}
          </Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {services.i18n.t('commerce.checkout.title')}
        </Text>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <SummaryRow
            label={services.i18n.t('commerce.checkout.itemCountLabel')}
            value={services.i18n.t('commerce.checkout.itemCountValue', {
              count: snapshot.itemCount,
            })}
          />
          <SummaryRow
            label={services.i18n.t('commerce.checkout.amountLabel')}
            value={formatMoney(
              snapshot.totalMinor,
              snapshot.lines[0]?.product.currency ??
                brand.commerce?.currency ??
                'CNY',
              locale,
            )}
            strong
          />
        </View>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {services.i18n.t('commerce.checkout.paymentMethod')}
        </Text>
        {providers.map(item => (
          <Pressable
            accessibilityLabel={services.i18n.t(
              `commerce.payment.provider.${item}`,
            )}
            accessibilityRole="radio"
            accessibilityState={{ checked: provider === item, disabled: busy }}
            key={item}
            disabled={busy}
            onPress={() => setProvider(item)}
            style={[
              styles.provider,
              {
                backgroundColor: colors.surface,
                borderColor: provider === item ? colors.primary : colors.border,
              },
              busy && styles.providerDisabled,
            ]}
          >
            <View
              style={[
                styles.providerIcon,
                item === 'wechat' ? styles.wechatIcon : styles.alipayIcon,
              ]}
            >
              <Text style={styles.providerIconText}>
                {services.i18n.t(`commerce.payment.provider.${item}.mark`)}
              </Text>
            </View>
            <Text style={[styles.providerName, { color: colors.text }]}>
              {services.i18n.t(`commerce.payment.provider.${item}`)}
            </Text>
            <Text style={[styles.radio, { color: colors.primary }]}>
              {provider === item ? '●' : '○'}
            </Text>
          </Pressable>
        ))}
        {messageKey ? (
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole={phase === 'failed' ? 'alert' : undefined}
            style={[
              styles.paymentMessage,
              { color: phase === 'failed' ? colors.danger : colors.textMuted },
            ]}
          >
            {services.i18n.t(messageKey)}
          </Text>
        ) : null}
        <PrimaryButton
          label={
            busy
              ? services.i18n.t('commerce.payment.processing')
              : services.i18n.t('commerce.payment.payWith', {
                  provider: services.i18n.t(
                    `commerce.payment.provider.${provider}.short`,
                  ),
                })
          }
          onPress={pay}
          disabled={busy || snapshot.lines.length === 0}
        />
        {paymentId && phase !== 'creating' ? (
          <Pressable
            accessibilityLabel={services.i18n.t(
              'commerce.payment.check.accessibilityLabel',
            )}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={checkPayment}
            style={styles.checkButton}
          >
            <Text style={[styles.checkButtonText, { color: colors.primary }]}>
              {services.i18n.t('commerce.payment.check.label')}
            </Text>
          </Pressable>
        ) : null}
        <Text style={[styles.securityNote, { color: colors.textMuted }]}>
          {services.i18n.t('commerce.payment.securityNote')}
        </Text>
      </ScrollView>
    );
  }

  return CheckoutScreen;
}
function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): React.JSX.Element {
  const { brand } = useApplication();
  return (
    <View style={styles.summaryRow}>
      <Text
        style={[styles.summaryLabel, { color: brand.theme.colors.textMuted }]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.summaryValue,
          strong && styles.summaryValueStrong,
          { color: brand.theme.colors.text },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 36, fontWeight: '600' },
  backButton: {
    minHeight: 40,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginBottom: 16,
  },
  back: { fontSize: 14, fontWeight: '600' },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 10,
  },
  checkoutContent: {
    width: '100%',
    maxWidth: 768,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 20,
  },
  summaryRow: {
    minHeight: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '500' },
  summaryValueStrong: { fontSize: 20, fontWeight: '600' },
  provider: {
    minHeight: 60,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  providerDisabled: { opacity: 0.55 },
  providerIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wechatIcon: { backgroundColor: '#07C160' },
  alipayIcon: { backgroundColor: '#1677FF' },
  providerIconText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  providerName: { flex: 1, fontSize: 15, fontWeight: '600', marginLeft: 12 },
  radio: { fontSize: 18 },
  paymentMessage: { fontSize: 13, lineHeight: 20, marginTop: 8 },
  checkButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkButtonText: { fontSize: 14, fontWeight: '600' },
  securityNote: {
    fontSize: 12,
    lineHeight: 19,
    marginTop: 18,
  },
});
