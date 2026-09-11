import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation } from '../../../app/navigation';
import { SkuCartStore, useSkuCart } from './SkuCartStore';
import { CartStore, useCart } from '../CartStore';

export function createSkuCartScreen(
  cart: SkuCartStore,
  legacyCart?: CartStore,
) {
  return function SkuCartScreen(): React.JSX.Element {
    const { brand, services } = useApplication();
    const navigate = useAppNavigation();
    const state = useSkuCart(cart);
    const [confirm, setConfirm] = useState<'clear' | 'remove' | null>(null);
    const mounted = useRef(false);
    const colors = brand.theme.colors;
    const t = services.i18n.t.bind(services.i18n);
    const run = (operation: Promise<unknown>) => {
      operation.catch(() => undefined);
    };
    useEffect(() => {
      mounted.current = true;
      run(cart.refresh());
      setConfirm(null);
      return () => {
        mounted.current = false;
      };
    }, [state.owner]);
    const rows = state.owner.userId
      ? state.items.map(item => ({
          id: item.id,
          name: `${item.productName} · ${item.skuName}`,
          quantity: item.quantity,
          selected: item.selected,
          price: `${item.currentPrice} ${item.currency}`,
          reason: item.valid ? null : item.invalidReason ?? 'UNAVAILABLE',
          available: item.available,
        }))
      : state.guests.map(item => ({
          id: item.skuId,
          name: item.name,
          quantity: item.quantity,
          selected: item.selected,
          price: null,
          reason: null,
          available: null,
        }));
    const selected = rows.filter(item => item.selected).map(item => item.id);
    function button(
      label: string,
      action: () => void,
      disabled = state.busy,
      checked?: boolean,
      visibleLabel = label,
    ) {
      return (
        <Pressable
          accessibilityLabel={label}
          accessibilityRole={checked === undefined ? 'button' : 'checkbox'}
          accessibilityState={{ disabled, checked }}
          disabled={disabled}
          onPress={action}
          style={({ pressed }) => [
            styles.button,
            {
              borderColor: checked ? colors.primary : colors.border,
              backgroundColor: pressed ? colors.background : colors.surface,
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          <Text style={{ color: checked ? colors.primary : colors.text }}>
            {visibleLabel}
          </Text>
        </Pressable>
      );
    }
    return (
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { backgroundColor: colors.background },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {t('commerce.cart.title')}
        </Text>
        {legacyCart && <LegacyCartNotice cart={legacyCart} />}
        <Text style={{ color: colors.textMuted }}>
          {t('commerce.cart.priceUnconfirmed')}
        </Text>
        {state.error && (
          <Text accessibilityRole="alert" style={{ color: colors.text }}>
            {t(state.error)}
          </Text>
        )}
        {state.busy && (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
            {t('commerce.cart.loading')}
          </Text>
        )}
        <View style={styles.actions}>
          {button(t('commerce.cart.refresh'), () => run(cart.refresh()))}
          {button(
            t('commerce.cart.selectAll'),
            () =>
              run(
                cart.selectItems(
                  rows.map(item => item.id),
                  selected.length !== rows.length,
                ),
              ),
            state.busy || !rows.length,
            !!rows.length && selected.length === rows.length,
          )}
          {button(
            t('commerce.cart.removeSelected'),
            () => setConfirm('remove'),
            state.busy || !selected.length,
          )}
          {button(
            t('commerce.cart.clear'),
            () => setConfirm('clear'),
            state.busy || !rows.length,
          )}
        </View>
        {confirm && (
          <View style={styles.actions}>
            <Text style={{ color: colors.text }}>
              {t('commerce.cart.confirmDelete')}
            </Text>
            {button(t('commerce.cart.confirm'), () => {
              run(
                confirm === 'clear' ? cart.clear() : cart.removeItems(selected),
              );
              setConfirm(null);
            })}
            {button(t('commerce.cart.cancel'), () => setConfirm(null))}
          </View>
        )}
        {state.owner.userId && state.guests.length > 0 && (
          <View style={[styles.row, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text }}>
              {t('commerce.cart.mergeNotice')}
            </Text>
            {state.guests.map(item => (
              <Text key={item.skuId} style={{ color: colors.text }}>
                {item.name} × {item.quantity}
              </Text>
            ))}
            {button(t('commerce.cart.mergeConfirm'), () =>
              run(cart.confirmGuestMerge()),
            )}
            {state.merge.map(item => (
              <View key={item.skuId} style={styles.actions}>
                <Text style={{ color: colors.text }}>
                  {item.skuId} · {t(`commerce.cart.merge.${item.status}`)}
                </Text>
                {item.status === 'unknown' && (
                  <>
                    {button(t('commerce.cart.mergeReceived'), () =>
                      run(
                        cart.resolveUnknownMerge(item.skuId, 'already-added'),
                      ),
                    )}
                    {button(t('commerce.cart.mergeRetry'), () =>
                      run(cart.resolveUnknownMerge(item.skuId, 'retry')),
                    )}
                  </>
                )}
              </View>
            ))}
          </View>
        )}
        {!rows.length && !state.busy && !state.error && (
          <Text style={{ color: colors.text }}>
            {t('commerce.cart.empty.title')}
          </Text>
        )}
        {rows.map(item => (
          <View
            key={item.id}
            style={[
              styles.row,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.name, { color: colors.text }]}>
              {item.name}
            </Text>
            {item.price && (
              <Text style={{ color: colors.text }}>
                {t('commerce.cart.rawPrice', { price: item.price })}
              </Text>
            )}
            <Text style={{ color: colors.textMuted }}>
              {item.available === null
                ? t('commerce.cart.stockUnknown')
                : t('commerce.cart.available', { count: item.available })}
            </Text>
            {item.reason && (
              <Text accessibilityRole="alert" style={{ color: colors.text }}>
                {t('commerce.cart.invalid')} · {item.reason}
              </Text>
            )}
            <View style={styles.actions}>
              {button(
                t('commerce.cart.select'),
                () =>
                  run(cart.updateItem(item.id, { selected: !item.selected })),
                state.busy,
                item.selected,
              )}
              {button(
                t('commerce.cart.quantity.decrease', { name: item.name }),
                () =>
                  run(
                    cart.updateItem(item.id, { quantity: item.quantity - 1 }),
                  ),
                state.busy || item.quantity <= 1,
                undefined,
                '−',
              )}
              <Text style={{ color: colors.text }}>{item.quantity}</Text>
              {button(
                t('commerce.cart.quantity.increase', { name: item.name }),
                () =>
                  run(
                    cart.updateItem(item.id, { quantity: item.quantity + 1 }),
                  ),
                state.busy || item.quantity >= 99,
                undefined,
                '+',
              )}
              {button(t('commerce.cart.remove'), () =>
                run(cart.removeItems([item.id])),
              )}
            </View>
          </View>
        ))}
        {button(
          t('commerce.cart.checkout'),
          () =>
            run(
              cart.captureCheckout().then(snapshot => {
                if (
                  mounted.current &&
                  cart.getCheckoutSnapshot(snapshot.snapshotId)
                ) {
                  navigate('CommerceCheckout', {
                    snapshotId: snapshot.snapshotId,
                  });
                }
              }),
            ),
          state.busy || !state.owner.userId || !selected.length,
        )}
        {!state.owner.userId && (
          <>
            <Text style={{ color: colors.textMuted }}>
              {t('commerce.cart.loginRequired')}
            </Text>
            {button(t('module.auth.title'), () =>
              navigate('AccountPasswordLogin'),
            )}
          </>
        )}
      </ScrollView>
    );
  };
}
function LegacyCartNotice({
  cart,
}: {
  cart: CartStore;
}): React.JSX.Element | null {
  const { services, brand } = useApplication();
  const navigate = useAppNavigation();
  const snapshot = useCart(cart);
  if (!snapshot.lines.length) return null;
  return (
    <View>
      {snapshot.lines.map(line => (
        <Pressable
          key={line.product.id}
          accessibilityRole="button"
          onPress={() =>
            navigate('CommerceProductDetail', { productId: line.product.id })
          }
          style={styles.button}
        >
          <Text style={{ color: brand.theme.colors.text }}>
            {services.i18n.t('commerce.cart.reselectSku', {
              name: line.product.name,
            })}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 768,
    alignSelf: 'center',
    padding: 24,
    gap: 16,
  },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '600' },
  name: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    minHeight: 44,
    minWidth: 44,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
