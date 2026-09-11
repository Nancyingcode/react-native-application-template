import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import type { OwnedState } from './OwnedStore';

export function AccountPage({
  title,
  state,
  refresh,
  children,
}: React.PropsWithChildren<{
  title: string;
  state: OwnedState;
  refresh(): void;
}>): React.JSX.Element {
  const { brand, services } = useApplication();
  const t = services.i18n.t.bind(services.i18n);
  return (
    <ScrollView
      style={{ backgroundColor: brand.theme.colors.background }}
      contentContainerStyle={accountStyles.page}
    >
      <Text
        accessibilityRole="header"
        style={[accountStyles.title, { color: brand.theme.colors.text }]}
      >
        {title}
      </Text>
      {!state.userId ? (
        <AccountText>{t('commerce.account.login')}</AccountText>
      ) : (
        <>
          <SecondaryAction
            label={t('commerce.account.refresh')}
            onPress={refresh}
            disabled={state.busy}
          />
          {state.busy ? (
            <View
              accessibilityLabel={t('commerce.account.loading')}
              accessibilityRole="progressbar"
            >
              <ActivityIndicator color={brand.theme.colors.primary} />
              <AccountText>{t('commerce.account.loading')}</AccountText>
            </View>
          ) : null}
          {state.error ? (
            <Text
              accessibilityRole="alert"
              style={[accountStyles.body, { color: brand.theme.colors.danger }]}
            >
              {t('commerce.account.error')}
            </Text>
          ) : null}
          {children}
        </>
      )}
    </ScrollView>
  );
}

export function SecondaryAction({
  label,
  accessibilityLabel = label,
  onPress,
  disabled = false,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress(): void;
  disabled?: boolean;
}): React.JSX.Element {
  const { brand } = useApplication();
  const [focused, setFocused] = useState(false);
  const colors = brand.theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        accountStyles.action,
        {
          borderColor: focused ? colors.primary : colors.border,
          backgroundColor: pressed ? colors.border : colors.surface,
        },
      ]}
    >
      <Text
        style={[
          accountStyles.actionLabel,
          { color: disabled ? colors.textMuted : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function AccountText({
  children,
  heading = false,
}: React.PropsWithChildren<{ heading?: boolean }>): React.JSX.Element {
  const { brand } = useApplication();
  return (
    <Text
      accessibilityRole={heading ? 'header' : undefined}
      style={[
        heading ? accountStyles.heading : accountStyles.body,
        { color: brand.theme.colors.text },
      ]}
    >
      {children}
    </Text>
  );
}

export const accountStyles = StyleSheet.create({
  page: {
    padding: 24,
    gap: 24,
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
    flexGrow: 1,
  },
  title: { fontSize: 32, lineHeight: 40, fontWeight: '600' },
  heading: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  section: { gap: 12 },
  action: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 2,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  actionLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    flexShrink: 1,
  },
  row: {
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
});
