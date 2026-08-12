import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApplication } from './ApplicationProvider';
import { AppNavigationProvider } from './navigation';

export function ApplicationShell(): React.JSX.Element {
  const { brand, services, application } = useApplication();
  const insets = useSafeAreaInsets();
  const [routeName, setRouteName] = useState(application.initialRoute);
  const colors = brand.theme.colors;
  const route = useMemo(
    () => application.routes.find(candidate => candidate.name === routeName),
    [application.routes, routeName],
  );
  const Screen = route?.component;

  const navigate = (next: string): void => {
    setRouteName(next);
    services.analytics.track('navigation', { route: next });
  };

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <Text style={styles.brandMarkText}>{brand.appName.slice(0, 1)}</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.appName, { color: colors.text }]}>
            {brand.appName}
          </Text>
          <Text style={[styles.environment, { color: colors.textMuted }]}>
            {services.i18n.t('app.environment')} ·{' '}
            {brand.compliance.jurisdiction}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        {routeName === 'Home' || !Screen ? (
          <ScrollView contentContainerStyle={styles.home}>
            <Text style={[styles.homeTitle, { color: colors.text }]}>
              {services.i18n.t('app.quickActions')}
            </Text>
            <View style={styles.cardGrid}>
              {application.home.map(item => (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  onPress={() => navigate(item.route)}
                  style={({ pressed }) => [
                    styles.card,
                    {
                      backgroundColor: colors.surface,
                      borderColor: pressed ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {services.i18n.t(item.titleKey)}
                  </Text>
                  <Text style={[styles.cardArrow, { color: colors.primary }]}>
                    →
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.disclosure, { color: colors.textMuted }]}>
              {services.i18n.t(brand.compliance.riskDisclosureKey)}
            </Text>
          </ScrollView>
        ) : (
          <AppNavigationProvider navigate={navigate}>
            <Screen />
          </AppNavigationProvider>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.menu,
          { paddingBottom: Math.max(insets.bottom, 10) },
        ]}
        style={[
          styles.menuBar,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
      >
        <MenuButton
          active={routeName === 'Home'}
          label={services.i18n.t('app.home')}
          onPress={() => navigate('Home')}
          color={colors.primary}
          muted={colors.textMuted}
        />
        {application.menu.map(item => (
          <MenuButton
            key={item.id}
            active={routeName === item.route}
            label={services.i18n.t(item.labelKey)}
            onPress={() => navigate(item.route)}
            color={colors.primary}
            muted={colors.textMuted}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function MenuButton({
  active,
  label,
  onPress,
  color,
  muted,
}: {
  active: boolean;
  label: string;
  onPress(): void;
  color: string;
  muted: string;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={styles.menuButton}
      accessibilityRole="tab"
    >
      <Text style={[styles.menuDot, { color: active ? color : muted }]}>●</Text>
      <Text style={[styles.menuLabel, { color: active ? color : muted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  headerCopy: { marginLeft: 12 },
  appName: { fontSize: 17, fontWeight: '800' },
  environment: { fontSize: 11, marginTop: 2 },
  content: { flex: 1 },
  home: { padding: 22 },
  homeTitle: { fontSize: 28, fontWeight: '800', marginVertical: 18 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47%',
    minHeight: 112,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    justifyContent: 'space-between',
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardArrow: { fontSize: 25, alignSelf: 'flex-end' },
  disclosure: { fontSize: 12, lineHeight: 18, marginTop: 28 },
  menuBar: { maxHeight: 74, borderTopWidth: StyleSheet.hairlineWidth },
  menu: { paddingHorizontal: 10, paddingTop: 8, alignItems: 'center' },
  menuButton: { minWidth: 72, paddingHorizontal: 10, alignItems: 'center' },
  menuDot: { height: 10, fontSize: 8, lineHeight: 10, marginBottom: 2 },
  menuLabel: { fontSize: 12, fontWeight: '700' },
});
