import React, { useEffect, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import type { NotificationsStore } from './NotificationsStore';

export function UnreadBadge({
  store,
  onPress,
}: {
  store: NotificationsStore;
  onPress(): void;
}): React.JSX.Element | null {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { brand, services } = useApplication();
  useEffect(() => {
    store.refresh();
    return store.cancelPending;
  }, [store, state.userId]);
  if (!state.userId) {
    return null;
  }
  const label =
    state.unread === null
      ? services.i18n.t('commerce.notifications.countUnknown')
      : services.i18n.t('commerce.notifications.unread', {
          count: state.unread,
        });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.badge}
    >
      <Text style={{ color: brand.theme.colors.primary }}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  badge: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
});
