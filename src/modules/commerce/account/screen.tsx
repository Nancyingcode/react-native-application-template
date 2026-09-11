import React, { useEffect, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation } from '../../../app/navigation';
import { PrimaryButton } from '../shared/ui';
import type { AccountStore } from './AccountStore';
import { AccountPage, accountStyles, AccountText } from './ui';

export function AccountScreen({
  store,
}: {
  store: AccountStore;
}): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const { services } = useApplication();
  const navigate = useAppNavigation();
  const t = services.i18n.t.bind(services.i18n);
  useEffect(() => {
    store.refresh();
    return store.cancelPending;
  }, [store, state.userId]);
  return (
    <AccountPage
      title={t('commerce.account.title')}
      state={state}
      refresh={store.refresh}
    >
      {state.member && state.points ? (
        <>
          <View style={accountStyles.section}>
            <AccountText heading>{state.member.levelConfig.name}</AccountText>
            <AccountText>
              {t('commerce.account.growth', {
                count: state.member.growthValue,
              })}
            </AccountText>
            <AccountText>
              {t('commerce.account.since', {
                date: state.member.createdAt.slice(0, 10),
              })}
            </AccountText>
          </View>
          <View style={accountStyles.section}>
            <AccountText heading>
              {t('commerce.account.points', { count: state.points.available })}
            </AccountText>
            <AccountText>
              {t('commerce.account.frozen', { count: state.points.frozen })}
            </AccountText>
            <AccountText>
              {t('commerce.account.earned', {
                count: state.points.totalEarned,
              })}
            </AccountText>
            <AccountText>
              {t('commerce.account.spent', { count: state.points.totalSpent })}
            </AccountText>
            <AccountText>
              {t('commerce.account.redemptionUnavailable')}
            </AccountText>
          </View>
          <View style={accountStyles.section}>
            <AccountText heading>{t('commerce.account.benefits')}</AccountText>
            {state.member.levelConfig.isActive ? (
              <>
                <AccountText>
                  {t(
                    state.member.levelConfig.freeShipping
                      ? 'commerce.account.freeShipping'
                      : 'commerce.account.standardShipping',
                  )}
                </AccountText>
                <AccountText>
                  {t('commerce.account.rateUnconfirmed')}
                </AccountText>
              </>
            ) : (
              <AccountText>{t('commerce.account.inactive')}</AccountText>
            )}
          </View>
        </>
      ) : null}
      <PrimaryButton
        label={t('commerce.notifications.title')}
        onPress={() => navigate('CommerceNotifications')}
      />
    </AccountPage>
  );
}

export function createAccountScreen(store: AccountStore) {
  return function CommerceAccount(): React.JSX.Element {
    return <AccountScreen store={store} />;
  };
}
