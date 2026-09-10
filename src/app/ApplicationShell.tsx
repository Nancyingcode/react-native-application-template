import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApplication } from './ApplicationProvider';
import { LocaleSwitcher } from './LocaleSwitcher';
import { UpdateCheck } from './UpdateCheck';
import { AppNavigationProvider, type RouteParams } from './navigation';

interface NavigationEntry {
  routeName: string;
  params: RouteParams;
}

export function ApplicationShell(): React.JSX.Element {
  const { services, application, modules } = useApplication();
  const [navigation, setNavigation] = useState<NavigationEntry>({
    routeName: application.initialRoute,
    params: {},
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const routeName = navigation.routeName;
  const route = useMemo(
    () => application.routes.find(candidate => candidate.name === routeName),
    [application.routes, routeName],
  );
  const Screen = route?.component;

  useEffect(() => {
    services.analytics.screen(routeName, {
      titleKey: route?.titleKey,
    });
  }, [route?.titleKey, routeName, services.analytics]);

  const navigate = (next: string, params: RouteParams = {}): void => {
    setMoreOpen(false);
    const target = modules
      .flatMap(module => module.routes)
      .find(candidate => candidate.name === next);
    const needsLogin = target?.requiresAuth && !services.session.getSnapshot();
    if (needsLogin) {
      setNavigation({ routeName: 'AccountPasswordLogin', params: {} });
      return;
    }
    setNavigation({ routeName: next, params });
  };

  return (
    <ShellFrame>
      <ShellHeader />
      <View style={styles.content}>
        {routeName === 'Home' || !Screen ? (
          <HomeContent navigate={navigate} />
        ) : (
          <AppNavigationProvider navigate={navigate} params={navigation.params}>
            <Screen />
          </AppNavigationProvider>
        )}
      </View>
      <ShellNavigation
        routeName={routeName}
        navigate={navigate}
        moreOpen={moreOpen}
        setMoreOpen={setMoreOpen}
      />
    </ShellFrame>
  );
}

interface NavigationProps {
  navigate(routeName: string, params?: RouteParams): void;
}

function ShellFrame({ children }: React.PropsWithChildren): React.JSX.Element {
  const { brand } = useApplication();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: brand.theme.colors.background,
          paddingTop: insets.top,
        },
      ]}
    >
      {children}
    </View>
  );
}

function useShellLayout() {
  const { width } = useWindowDimensions();
  return {
    width,
    horizontalPadding: width >= 768 ? 32 : 20,
    compactHeader: width <= 375,
  };
}

function ShellHeader(): React.JSX.Element {
  const { brand, environment, services } = useApplication();
  const insets = useSafeAreaInsets();
  const { horizontalPadding, compactHeader } = useShellLayout();
  const colors = brand.theme.colors;
  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          paddingLeft: horizontalPadding + insets.left,
          paddingRight: horizontalPadding + insets.right,
        },
      ]}
    >
      <View style={styles.brandIdentity}>
        <View style={[styles.brandMark, { backgroundColor: colors.primary }]}>
          <Text style={styles.brandMarkText}>{brand.appName.slice(0, 1)}</Text>
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.appName,
            compactHeader && styles.appNameCompact,
            { color: colors.text },
          ]}
        >
          {brand.appName}
        </Text>
      </View>
      <View style={styles.headerActions}>
        {environment !== 'production' ? (
          <View
            style={[
              styles.environmentBadge,
              compactHeader && styles.environmentBadgeCompact,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.environment,
                compactHeader && styles.environmentCompact,
                { color: colors.textMuted },
              ]}
            >
              {services.i18n.t(`app.environment.${environment}`)} ·{' '}
              {brand.compliance.jurisdiction}
            </Text>
          </View>
        ) : null}
        <LocaleSwitcher />
      </View>
    </View>
  );
}

function HomeContent({ navigate }: NavigationProps): React.JSX.Element {
  const { brand, services, application } = useApplication();
  const { width, horizontalPadding } = useShellLayout();
  const colors = brand.theme.colors;
  const contentWidth = Math.min(width - horizontalPadding * 2, 960);
  const columnCount = width >= 768 ? 3 : 2;
  const cardWidth =
    (contentWidth - styles.cardGrid.gap * (columnCount - 1)) / columnCount;
  return (
    <ScrollView
      contentContainerStyle={[
        styles.home,
        { paddingHorizontal: horizontalPadding },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.homeInner}>
        <Text
          accessibilityRole="header"
          style={[styles.homeTitle, { color: colors.text }]}
        >
          {services.i18n.t('app.quickActions')}
        </Text>
        <UpdateCheck />
        <View style={styles.cardGrid}>
          {application.home.map(item => (
            <Pressable
              accessibilityLabel={services.i18n.t(item.titleKey)}
              accessibilityRole="button"
              key={item.id}
              onPress={() => navigate(item.route)}
              style={({ pressed }) => [
                styles.card,
                {
                  width: cardWidth,
                  backgroundColor: colors.surface,
                  borderColor: pressed ? colors.primary : colors.border,
                },
                pressed && styles.cardPressed,
              ]}
            >
              <View
                style={[
                  styles.cardIcon,
                  { backgroundColor: colors.background },
                ]}
              >
                <Text style={[styles.cardIconText, { color: colors.primary }]}>
                  {getNavigationGlyph(item.id)}
                </Text>
              </View>
              <View style={styles.cardFooter}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {services.i18n.t(item.titleKey)}
                </Text>
                <Text style={[styles.cardArrow, { color: colors.textMuted }]}>
                  ›
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        <View
          style={[
            styles.disclosureBox,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.disclosureIcon,
              { backgroundColor: colors.background },
            ]}
          >
            <Text
              style={[styles.disclosureIconText, { color: colors.primary }]}
            >
              !
            </Text>
          </View>
          <Text style={[styles.disclosure, { color: colors.textMuted }]}>
            {services.i18n.t(brand.compliance.riskDisclosureKey)}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function ShellNavigation({
  routeName,
  navigate,
  moreOpen,
  setMoreOpen,
}: NavigationProps & {
  routeName: string;
  moreOpen: boolean;
  setMoreOpen(open: boolean): void;
}): React.JSX.Element {
  const { brand, services, application } = useApplication();
  const insets = useSafeAreaInsets();
  const colors = brand.theme.colors;
  let menuRouteName =
    routeName === 'CommerceProductDetail'
      ? 'CommerceProducts'
      : routeName === 'CommerceCheckout'
      ? 'CommerceCart'
      : routeName;
  if (routeName === 'Register') {
    menuRouteName = 'Login';
  }
  const primaryMenu = application.menu.slice(0, 3);
  const secondaryMenu = application.menu.slice(3);
  const secondaryActive = secondaryMenu.some(
    item => item.route === menuRouteName,
  );
  return (
    <>
      <View
        style={[
          styles.menuBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <MenuButton
          active={menuRouteName === 'Home'}
          glyph="⌂"
          label={services.i18n.t('app.home')}
          onPress={() => navigate('Home')}
          color={colors.primary}
          muted={colors.textMuted}
        />
        {primaryMenu.map(item => (
          <MenuButton
            key={item.id}
            active={menuRouteName === item.route}
            glyph={getNavigationGlyph(item.id)}
            label={services.i18n.t(item.labelKey)}
            onPress={() => navigate(item.route)}
            color={colors.primary}
            muted={colors.textMuted}
          />
        ))}
        {secondaryMenu.length > 0 ? (
          <MenuButton
            active={secondaryActive || moreOpen}
            glyph="•••"
            label={services.i18n.t('app.more')}
            onPress={() => setMoreOpen(true)}
            color={colors.primary}
            muted={colors.textMuted}
          />
        ) : null}
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setMoreOpen(false)}
        statusBarTranslucent
        transparent
        visible={moreOpen}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel={services.i18n.t('app.close')}
            accessibilityRole="button"
            onPress={() => setMoreOpen(false)}
            style={styles.modalBackdrop}
          />
          <View
            style={[
              styles.moreSheet,
              {
                backgroundColor: colors.surface,
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
          >
            <View
              style={[styles.sheetHandle, { backgroundColor: colors.border }]}
            />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {services.i18n.t('app.more')}
            </Text>
            <View style={styles.moreList}>
              {secondaryMenu.map(item => {
                const active = menuRouteName === item.route;
                return (
                  <Pressable
                    accessibilityLabel={services.i18n.t(item.labelKey)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    key={item.id}
                    onPress={() => navigate(item.route)}
                    style={({ pressed }) => [
                      styles.moreItem,
                      { borderColor: colors.border },
                      active && { backgroundColor: colors.background },
                      pressed && styles.moreItemPressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.moreIcon,
                        { backgroundColor: colors.background },
                      ]}
                    >
                      <Text
                        style={[
                          styles.moreIconText,
                          { color: active ? colors.primary : colors.textMuted },
                        ]}
                      >
                        {getNavigationGlyph(item.id)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.moreLabel,
                        { color: active ? colors.primary : colors.text },
                      ]}
                    >
                      {services.i18n.t(item.labelKey)}
                    </Text>
                    <Text
                      style={[styles.moreArrow, { color: colors.textMuted }]}
                    >
                      ›
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function MenuButton({
  active,
  glyph,
  label,
  onPress,
  color,
  muted,
}: {
  active: boolean;
  glyph: string;
  label: string;
  onPress(): void;
  color: string;
  muted: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuButton,
        pressed && styles.menuPressed,
      ]}
    >
      <View
        style={[styles.activeIndicator, active && { backgroundColor: color }]}
      />
      <Text style={[styles.menuGlyph, { color: active ? color : muted }]}>
        {glyph}
      </Text>
      <Text style={[styles.menuLabel, { color: active ? color : muted }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function getNavigationGlyph(id: string): string {
  if (id.includes('profile')) {
    return '◎';
  }
  if (id.includes('login')) {
    return '○';
  }
  if (id.includes('market')) {
    return '↗';
  }
  if (id.includes('trading')) {
    return '⇄';
  }
  if (id.includes('portfolio')) {
    return '◔';
  }
  if (id.includes('news')) {
    return '≡';
  }
  if (id.includes('onboarding')) {
    return '+';
  }
  if (id.includes('commerce')) {
    return '□';
  }
  if (id.includes('advanced')) {
    return '≋';
  }
  return '•';
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  brandIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerActions: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  appName: { flexShrink: 1, marginLeft: 10, fontSize: 16, fontWeight: '600' },
  appNameCompact: { marginLeft: 8, fontSize: 15 },
  environmentBadge: {
    maxWidth: 180,
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  environmentBadgeCompact: { maxWidth: 110, paddingHorizontal: 8 },
  environment: { fontSize: 11, fontWeight: '500' },
  environmentCompact: { fontSize: 10 },
  content: { flex: 1 },
  home: { paddingTop: 28, paddingBottom: 28 },
  homeInner: { width: '100%', maxWidth: 960, alignSelf: 'center' },
  homeTitle: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '600',
    letterSpacing: -0.4,
    marginBottom: 20,
  },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    minHeight: 126,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    justifyContent: 'space-between',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardPressed: { opacity: 0.82 },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconText: { fontSize: 22, lineHeight: 26, fontWeight: '500' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  cardArrow: { fontSize: 22, lineHeight: 24 },
  disclosureBox: {
    minHeight: 58,
    marginTop: 20,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  disclosureIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  disclosureIconText: { fontSize: 15, fontWeight: '700' },
  disclosure: { flex: 1, fontSize: 12, lineHeight: 18 },
  menuBar: {
    minHeight: 66,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  menuButton: {
    flex: 1,
    minWidth: 60,
    minHeight: 58,
    paddingHorizontal: 4,
    paddingTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    left: '22%',
    right: '22%',
    height: 2,
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  menuPressed: { opacity: 0.65 },
  menuGlyph: { fontSize: 20, lineHeight: 22, fontWeight: '500' },
  menuLabel: { fontSize: 11, lineHeight: 16, fontWeight: '600', marginTop: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(16, 24, 40, 0.42)',
  },
  moreSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
    paddingHorizontal: 20,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  moreList: { marginTop: 14, gap: 8 },
  moreItem: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  moreItemPressed: { opacity: 0.7 },
  moreIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  moreIconText: { fontSize: 18, lineHeight: 21, fontWeight: '500' },
  moreLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  moreArrow: { fontSize: 22 },
});
