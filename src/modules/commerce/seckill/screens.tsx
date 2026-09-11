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
import { ShippingAddressForm } from '../checkout/ShippingAddressForm';
import {
  validateShippingAddress,
  type ShippingAddressDraft,
  type ShippingAddressErrors,
} from '../checkout/shippingAddress';
import { PrimaryButton } from '../shared/ui';
import { SeckillStore, type Submission } from './SeckillStore';
import { getActivityPhase, getQuantityLimit } from './state';
import type { SeckillActivity, SeckillPort } from './types';

function useCopy() {
  const { brand, services, locale } = useApplication();
  return {
    colors: brand.theme.colors,
    locale,
    t: (key: string) => services.i18n.t(`commerce.seckill.${key}`),
  };
}
function useClock(store?: SeckillStore): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      store?.tick();
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [store]);
  return now;
}
function Copy({
  children,
  heading = false,
}: React.PropsWithChildren<{ heading?: boolean }>) {
  const { colors } = useCopy();
  return (
    <Text
      accessibilityRole={heading ? 'header' : undefined}
      style={[heading ? styles.heading : styles.body, { color: colors.text }]}
    >
      {children}
    </Text>
  );
}
function Page({ children }: React.PropsWithChildren) {
  const { colors } = useCopy();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.page}
    >
      {children}
    </ScrollView>
  );
}
function ActivityInfo({
  activity,
  now,
}: {
  activity: SeckillActivity;
  now: number;
}) {
  const { t } = useCopy();
  return (
    <View style={styles.section}>
      <Copy heading>{activity.name}</Copy>
      <Copy>{t(getActivityPhase(activity, now))}</Copy>
      <Copy>
        {t('start')}: {formatActivityTime(activity.startAt)}
      </Copy>
      <Copy>
        {t('end')}: {formatActivityTime(activity.endAt)}
      </Copy>
    </View>
  );
}
function formatActivityTime(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  // Hermes 的 toLocaleString 在部分原生环境忽略 locale，使用明确的本地时间格式。
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function Outcome({ value }: { value: Submission }) {
  const { t } = useCopy();
  return (
    <View accessibilityLiveRegion="polite" style={styles.section}>
      <Copy heading>{t(value.status)}</Copy>
      {value.status === 'queued' ? (
        <>
          <Copy>
            {t('requestId')}: {value.requestId}
          </Copy>
          <Copy>{t('queueNotice')}</Copy>
        </>
      ) : null}
      {value.status === 'unknown' ? <Copy>{t('unknownNotice')}</Copy> : null}
    </View>
  );
}

function DetailForm({ store }: { store: SeckillStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { t, colors } = useCopy();
  const { services } = useApplication();
  const [skuId, setSkuId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [quantityFocused, setQuantityFocused] = useState(false);
  const [address, setAddress] = useState<ShippingAddressDraft>({});
  const [errors, setErrors] = useState<ShippingAddressErrors>({});
  const now = useClock(store);
  const activity = state.activity;
  if (!activity) {
    return null;
  }
  const sku = activity.skus.find(item => item.skuId === skuId);
  const outcome = state.submissions[skuId];
  const locked = state.busy || !!outcome;
  const active = getActivityPhase(activity, now) === 'active';
  const canSubmit =
    sku &&
    !locked &&
    active &&
    state.tokenReady &&
    !!store.presentPrice(sku) &&
    getQuantityLimit(sku) > 0;
  function submit() {
    const checked = validateShippingAddress(address, key =>
      services.i18n.t(key),
    );
    setErrors(checked.valid ? {} : checked.errors);
    if (checked.valid) {
      store.submit(
        skuId,
        /^\d+$/.test(quantity) ? Number(quantity) : NaN,
        checked.value,
      );
    }
  }
  return (
    <>
      <ActivityInfo activity={activity} now={now} />
      <View style={styles.section}>
        <Copy heading>{t('sku')}</Copy>
        {!activity.skus.length ? <Copy>{t('noSkus')}</Copy> : null}
        {activity.skus.map(item => (
          <Pressable
            key={item.skuId}
            accessibilityRole="radio"
            accessibilityLabel={`${t('sku')}: ${item.skuId}`}
            accessibilityState={{
              checked: item.skuId === skuId,
              disabled: state.busy,
            }}
            disabled={state.busy}
            onPress={() => {
              setSkuId(item.skuId);
              setQuantity('1');
            }}
            style={[
              styles.sku,
              {
                borderColor:
                  item.skuId === skuId ? colors.primary : colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <Copy>
              {t('sku')}: {item.skuId}
            </Copy>
            <Copy>{store.presentPrice(item) ?? t('priceUnknown')}</Copy>
            <Copy>
              {t('stock')}: {item.availableStock} · {t('limit')}:{' '}
              {item.perUserLimit}
            </Copy>
            {item.availableStock === 0 ? <Copy>{t('soldOut')}</Copy> : null}
          </Pressable>
        ))}
      </View>
      {sku ? (
        <>
          {outcome ? (
            <Outcome value={outcome} />
          ) : (
            <>
              <View style={styles.section}>
                <Copy heading>{t('quantity')}</Copy>
                <TextInput
                  accessibilityLabel={t('quantity')}
                  accessibilityState={{ disabled: locked }}
                  editable={!locked}
                  keyboardType="number-pad"
                  value={quantity}
                  onChangeText={setQuantity}
                  onFocus={() => setQuantityFocused(true)}
                  onBlur={() => setQuantityFocused(false)}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: colors.surface,
                      borderColor: quantityFocused
                        ? colors.primary
                        : colors.border,
                    },
                  ]}
                />
                <Copy>{t('quantityHint')}</Copy>
              </View>
              <View style={styles.section}>
                <Copy heading>{t('address')}</Copy>
                <ShippingAddressForm
                  value={address}
                  errors={errors}
                  disabled={locked}
                  onChange={value => {
                    setAddress(value);
                    setErrors({});
                  }}
                />
              </View>
              {state.error ? (
                <Text
                  accessibilityRole="alert"
                  style={[styles.body, { color: colors.danger }]}
                >
                  {t(state.error)}
                </Text>
              ) : null}
              {state.tokenReady ? (
                <Copy>{t('tokenReady')}</Copy>
              ) : (
                <PrimaryButton
                  label={t('token')}
                  disabled={locked || !active || getQuantityLimit(sku) === 0}
                  onPress={() => {
                    store.acquireToken();
                  }}
                />
              )}
              <PrimaryButton
                label={state.busy ? t('busy') : t('submit')}
                disabled={!canSubmit}
                onPress={submit}
              />
            </>
          )}
        </>
      ) : null}
    </>
  );
}

export function createSeckillScreens(
  repository: SeckillPort,
  store: SeckillStore,
) {
  function SeckillListScreen(): React.JSX.Element {
    const { services } = useApplication();
    const session = useSyncExternalStore(
      services.session.subscribe,
      services.session.getSnapshot,
    );
    const navigate = useAppNavigation();
    const { t } = useCopy();
    const [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState<{
      owner: typeof session;
      items?: SeckillActivity[];
      failed?: boolean;
    }>();
    const now = useClock();
    useEffect(() => {
      let current = true;
      setResult(undefined);
      if (session) {
        repository
          .list()
          .then(items => {
            if (current) {
              setResult({ owner: session, items });
            }
          })
          .catch(() => {
            if (current) {
              setResult({ owner: session, failed: true });
            }
          });
      }
      return () => {
        current = false;
      };
    }, [session, attempt]);
    const visible = result?.owner === session ? result : undefined;
    return (
      <Page>
        <Copy heading>{t('title')}</Copy>
        <Copy>{t('intro')}</Copy>
        {!session ? (
          <PrimaryButton label={t('login')} onPress={() => navigate('Login')} />
        ) : (
          <>
            {!visible ? (
              <>
                <ActivityIndicator />
                <Copy>{t('loading')}</Copy>
              </>
            ) : null}
            {visible?.failed ? (
              <>
                <Copy>{t('loadFailed')}</Copy>
                <PrimaryButton
                  label={t('retry')}
                  onPress={() => setAttempt(value => value + 1)}
                />
              </>
            ) : null}
            {visible?.items?.length === 0 ? <Copy>{t('empty')}</Copy> : null}
            {visible?.items?.map(activity => (
              <View key={activity.id} style={styles.section}>
                <ActivityInfo activity={activity} now={now} />
                <PrimaryButton
                  label={t('view')}
                  onPress={() =>
                    navigate('CommerceSeckillDetail', {
                      activityId: activity.id,
                    })
                  }
                />
              </View>
            ))}
          </>
        )}
      </Page>
    );
  }
  function SeckillDetailScreen(): React.JSX.Element {
    const { activityId = '' } = useRouteParams();
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const navigate = useAppNavigation();
    const { t, colors } = useCopy();
    useEffect(() => {
      store.open(activityId);
      return () => store.leave();
    }, [activityId, state.generation]);
    return (
      <Page>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          style={styles.back}
          onPress={() => navigate('CommerceSeckill')}
        >
          <Text style={[styles.body, { color: colors.primary }]}>
            {t('back')}
          </Text>
        </Pressable>
        {!state.userId ? (
          <PrimaryButton label={t('login')} onPress={() => navigate('Login')} />
        ) : (
          <>
            {state.busy ? (
              <ActivityIndicator accessibilityLabel={t('busy')} />
            ) : null}
            {state.error && !state.activity ? (
              <Text
                accessibilityRole="alert"
                style={[styles.body, { color: colors.danger }]}
              >
                {t(state.error)}
              </Text>
            ) : null}
            {!state.activity && state.error ? (
              <PrimaryButton
                label={t('retry')}
                onPress={() => {
                  store.open(activityId);
                }}
              />
            ) : null}
            {state.activity?.id === activityId ? (
              <DetailForm
                key={`${state.generation}:${activityId}`}
                store={store}
              />
            ) : null}
          </>
        )}
      </Page>
    );
  }
  return { SeckillListScreen, SeckillDetailScreen };
}

const styles = StyleSheet.create({
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  page: {
    padding: 24,
    gap: 24,
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    paddingBottom: 48,
  },
  section: { gap: 12 },
  heading: { fontSize: 22, fontWeight: '600', lineHeight: 30 },
  body: { fontSize: 15, lineHeight: 23, flexShrink: 1 },
  sku: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
});
