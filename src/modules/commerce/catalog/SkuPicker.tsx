import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { PrimaryButton } from '../shared/ui';
import type { CatalogRepository, CatalogSku } from './api';
import type { CartCheckoutPort } from '../cart/contracts';

export interface CatalogIntegration {
  repository: CatalogRepository;
  addItem: CartCheckoutPort['addItem'];
  cartSummary?: {
    subscribe(listener: () => void): () => void;
    getItemCount(): number;
  };
}

export function SkuPicker({
  productId,
  integration,
}: {
  productId: string;
  integration: CatalogIntegration;
}) {
  const { brand, services } = useApplication();
  const session = useSyncExternalStore(
    services.session.subscribe,
    services.session.getSnapshot,
    services.session.getSnapshot,
  );
  const colors = brand.theme.colors;
  const t = (key: string) => services.i18n.t(`commerce.detail.sku.${key}`);
  const [skus, setSkus] = useState<CatalogSku[]>([]);
  const [selected, setSelected] = useState<string>();
  const [quantity, setQuantity] = useState('1');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [inventoryAttempt, setInventoryAttempt] = useState(0);
  const [quantityFocused, setQuantityFocused] = useState(false);
  const [stock, setStock] = useState<{
    skuId: string;
    session: typeof session;
    available: number;
  }>();
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const operation = useRef({ active: false, generation: 0 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setSelected(undefined);
    integration.repository
      .listSkus(productId)
      .then(items => {
        if (!cancelled) {
          setSkus(items.filter(item => item.status === 'ACTIVE'));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, integration.repository, productId]);

  useEffect(() => {
    const current = operation.current;
    current.generation += 1;
    current.active = false;
    setBusy(false);
    setFeedback('');
    return () => {
      current.generation += 1;
    };
  }, [productId, session, selected]);

  useEffect(() => {
    let cancelled = false;
    setStock(undefined);
    setChecking(false);
    if (!selected || !session) {
      return;
    }
    setChecking(true);
    integration.repository
      .inventory(selected)
      .then(value => {
        if (!cancelled) {
          setStock({ skuId: selected, session, available: value.available });
        }
      })
      .catch(() => {
        // 鉴权或网络失败都不能证明售罄，保留未知库存状态。
      })
      .finally(() => {
        if (!cancelled) {
          setChecking(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inventoryAttempt, integration.repository, selected, session]);

  const sku = skus.find(item => item.id === selected);
  const available =
    stock?.skuId === selected && stock?.session === session
      ? stock?.available
      : undefined;
  const count = Number(quantity);
  const validQuantity =
    /^\d+$/.test(quantity) &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= 99;
  const insufficient = available !== undefined && count > available;
  const canAdd =
    Boolean(sku) &&
    validQuantity &&
    !insufficient &&
    !busy &&
    !checking &&
    !loading &&
    !failed;
  const add = async () => {
    if (!canAdd || !sku || operation.current.active) {
      return;
    }
    const generation = operation.current.generation;
    const current = () =>
      generation === operation.current.generation &&
      services.session.getSnapshot() === session;
    operation.current.active = true;
    setBusy(true);
    setFeedback('');
    try {
      const freshSku = await integration.repository.getSku(sku.id);
      if (!current()) {
        return;
      }
      if (freshSku.productId !== productId || freshSku.status !== 'ACTIVE') {
        setFeedback('unavailable');
        return;
      }
      if (session) {
        // 加购前重新读取所选 SKU，列表中的库存不能保证仍满足当前数量。
        const freshStock = await integration.repository.inventory(sku.id);
        if (!current()) {
          return;
        }
        setStock({ skuId: sku.id, session, available: freshStock.available });
        if (freshStock.available < count) {
          setFeedback('insufficient');
          return;
        }
      }
      await integration.addItem(sku.id, count);
      if (current()) {
        setFeedback('added');
      }
    } catch {
      // 累加操作结果未知时不自动重放；由购物车公开实现负责对账与恢复。
      if (current()) {
        setFeedback('addFailed');
      }
    } finally {
      if (current()) {
        operation.current.active = false;
        setBusy(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.text }]}
      >
        {t('title')}
      </Text>
      {loading ? (
        <ActivityIndicator
          accessibilityLabel={t('loading')}
          color={colors.primary}
        />
      ) : null}
      {failed ? (
        <PrimaryButton
          label={t('retry')}
          onPress={() => setAttempt(value => value + 1)}
          compact
        />
      ) : null}
      {!loading && !failed && skus.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>{t('empty')}</Text>
      ) : null}
      <View style={styles.options}>
        {skus.map(item => (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityState={{
              checked: item.id === selected,
              disabled: busy,
            }}
            disabled={busy}
            onPress={() => {
              setSelected(item.id);
              setQuantity('1');
            }}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor:
                  item.id === selected ? colors.primary : colors.border,
                backgroundColor: pressed ? colors.background : colors.surface,
              },
            ]}
          >
            <Text style={{ color: colors.text }}>
              {item.name || item.skuCode}
            </Text>
            {Object.entries(item.attributes ?? {})
              .filter(
                ([, value]) =>
                  typeof value === 'string' || typeof value === 'number',
              )
              .map(([key, value]) => (
                <Text key={key} style={{ color: colors.textMuted }}>
                  {key}: {String(value)}
                </Text>
              ))}
          </Pressable>
        ))}
      </View>
      {sku ? (
        <Text style={{ color: colors.textMuted }}>{t('priceUnknown')}</Text>
      ) : null}
      <Text style={{ color: colors.text }}>{t('quantity')}</Text>
      <TextInput
        accessibilityLabel={t('quantity')}
        editable={!busy}
        keyboardType="number-pad"
        onFocus={() => setQuantityFocused(true)}
        onBlur={() => setQuantityFocused(false)}
        value={quantity}
        onChangeText={value => {
          setQuantity(value);
          setFeedback('');
        }}
        style={[
          styles.input,
          {
            color: colors.text,
            borderColor: quantityFocused ? colors.primary : colors.border,
          },
        ]}
      />
      {!validQuantity ? (
        <Text style={{ color: colors.danger }}>{t('invalidQuantity')}</Text>
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: colors.textMuted }}
      >
        {checking
          ? t('checking')
          : inventoryLabel(
              available,
              t,
              services.i18n.t('commerce.detail.stock', {
                count: available ?? 0,
              }),
            )}
      </Text>
      {insufficient && available !== 0 ? (
        <Text style={{ color: colors.danger }}>{t('insufficient')}</Text>
      ) : null}
      {selected && session && available === undefined && !checking ? (
        <PrimaryButton
          label={t('retryInventory')}
          onPress={() => setInventoryAttempt(value => value + 1)}
          disabled={busy}
          compact
        />
      ) : null}
      {feedback ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
          {t(feedback)}
        </Text>
      ) : null}
      <PrimaryButton
        label={
          busy ? t('adding') : services.i18n.t('commerce.detail.addToCart')
        }
        onPress={add}
        disabled={!canAdd}
      />
    </View>
  );
}

function inventoryLabel(
  available: number | undefined,
  t: (key: string) => string,
  stock: string,
) {
  if (available === undefined) {
    return t('unknown');
  }
  if (available === 0) {
    return t('soldOut');
  }
  return stock;
}
const styles = StyleSheet.create({
  container: { gap: 16, marginTop: 24 },
  title: { fontSize: 18, fontWeight: '600' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    minHeight: 44,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    maxWidth: '100%',
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
});
