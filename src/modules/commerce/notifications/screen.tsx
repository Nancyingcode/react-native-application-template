import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import {
  AccountPage,
  accountStyles,
  AccountText,
  SecondaryAction,
} from '../account/ui';
import { PrimaryButton } from '../shared/ui';
import type { NotificationsStore } from './NotificationsStore';

export function NotificationsScreen({
  store,
}: {
  store: NotificationsStore;
}): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [confirmation, setConfirmation] = useState(false);
  const { brand, services } = useApplication();
  const t = services.i18n.t.bind(services.i18n);
  useEffect(() => {
    setConfirmation(false);
    store.refresh();
    return store.cancelPending;
  }, [store, state.userId]);
  return (
    <AccountPage
      title={t('commerce.notifications.title')}
      state={state}
      refresh={store.refresh}
    >
      <AccountText>
        {state.unread === null
          ? t('commerce.notifications.countUnknown')
          : t('commerce.notifications.unread', { count: state.unread })}
      </AccountText>
      <SecondaryAction
        label={t('commerce.notifications.readAll')}
        disabled={state.busy || state.unread === 0}
        onPress={() => setConfirmation(true)}
      />
      {confirmation ? (
        <View style={accountStyles.section}>
          <AccountText>{t('commerce.notifications.confirmAll')}</AccountText>
          <PrimaryButton
            compact
            label={t('commerce.notifications.confirm')}
            disabled={state.busy}
            onPress={() => {
              setConfirmation(false);
              store.markAllRead();
            }}
          />
          <SecondaryAction
            label={t('commerce.notifications.cancel')}
            onPress={() => setConfirmation(false)}
          />
        </View>
      ) : null}
      {state.loaded && state.items.length === 0 ? (
        <AccountText>{t('commerce.notifications.empty')}</AccountText>
      ) : null}
      {state.items.map(item => (
        <View
          key={item.id}
          style={[
            accountStyles.row,
            { borderColor: brand.theme.colors.border },
          ]}
        >
          <AccountText heading>{item.title}</AccountText>
          <AccountText>{item.content}</AccountText>
          <AccountText>
            {item.createdAt.replace('T', ' ').slice(0, 16)}
          </AccountText>
          {item.status === 'READ' || item.readAt !== null ? (
            <AccountText>{t('commerce.notifications.read')}</AccountText>
          ) : (
            <SecondaryAction
              label={t('commerce.notifications.readAction')}
              accessibilityLabel={t('commerce.notifications.markRead', {
                title: item.title,
              })}
              onPress={() => {
                store.markRead(item.id);
              }}
              disabled={state.busy}
            />
          )}
        </View>
      ))}
      {state.nextCursor !== null ? (
        <SecondaryAction
          label={t('commerce.notifications.more')}
          onPress={store.loadMore}
          disabled={state.busy}
        />
      ) : null}
    </AccountPage>
  );
}

export function createNotificationsScreen(store: NotificationsStore) {
  return function CommerceNotifications(): React.JSX.Element {
    return <NotificationsScreen store={store} />;
  };
}
