import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useApplication } from './ApplicationProvider';

export function LocaleSwitcher(): React.JSX.Element | null {
  const { brand, locale, services, setLocale } = useApplication();
  const locales = brand.supportedLocales;
  if (locales.length < 2) {
    return null;
  }

  const currentIndex = Math.max(0, locales.indexOf(locale));
  const nextLocale = locales[(currentIndex + 1) % locales.length];
  const colors = brand.theme.colors;

  return (
    <Pressable
      accessibilityHint={services.i18n.t('app.language.current', { locale })}
      accessibilityLabel={services.i18n.t('app.language.switch')}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => setLocale(nextLocale)}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? colors.background : colors.surface,
          borderColor: pressed ? colors.primary : colors.border,
        },
      ]}
      testID="locale-switcher"
    >
      <Text style={[styles.label, { color: colors.text }]}>
        {getLocaleBadge(nextLocale)}
      </Text>
    </Pressable>
  );
}

function getLocaleBadge(locale: string): string {
  return locale.trim().replaceAll('_', '-').split('-')[0].toUpperCase();
}

const styles = StyleSheet.create({
  button: {
    minWidth: 42,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
});
