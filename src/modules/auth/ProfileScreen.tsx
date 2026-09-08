import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApplication } from '../../app/ApplicationProvider';
import { useAppNavigation } from '../../app/navigation';
import type { ThemeTokens } from '../../brand/types';
import type { UserProfile } from './profileRepository';
import { useProfile } from './useProfile';

type ProfileStyles = ReturnType<typeof createStyles>;

export function ProfileScreen(): React.JSX.Element {
  const { brand } = useApplication();
  const navigate = useAppNavigation();
  const profile = useProfile();
  const styles = useMemo(() => createStyles(brand.theme), [brand.theme]);

  return (
    <ProfileLayout
      onRefresh={profile.refresh}
      refreshing={profile.refreshing}
      styles={styles}
    >
      <ProfileHeader
        busy={profile.loading || profile.refreshing}
        onBack={() => navigate('Home')}
        onRefresh={profile.refresh}
        refreshing={profile.refreshing}
        styles={styles}
      />
      {profile.profile ? (
        <>
          {profile.errorKey ? (
            <RefreshError errorKey={profile.errorKey} styles={styles} />
          ) : null}
          <ProfileContent profile={profile.profile} styles={styles} />
        </>
      ) : (
        <ProfileFeedback
          errorKey={profile.errorKey}
          loading={profile.loading}
          onRetry={profile.refresh}
          onSignIn={() => navigate('AccountPasswordLogin')}
          styles={styles}
        />
      )}
    </ProfileLayout>
  );
}

function ProfileLayout({
  children,
  onRefresh,
  refreshing,
  styles,
}: React.PropsWithChildren<{
  onRefresh(): void;
  refreshing: boolean;
  styles: ProfileStyles;
}>): React.JSX.Element {
  const { brand } = useApplication();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const padding = width >= 768 ? brand.theme.spacing.xl : 20;
  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        {
          paddingLeft: padding + insets.left,
          paddingRight: padding + insets.right,
        },
      ]}
      refreshControl={
        <RefreshControl
          colors={[brand.theme.colors.primary]}
          onRefresh={onRefresh}
          refreshing={refreshing}
          tintColor={brand.theme.colors.primary}
        />
      }
      style={styles.root}
      testID="profile-scroll"
    >
      <View style={styles.inner}>{children}</View>
    </ScrollView>
  );
}

function ProfileHeader({
  busy,
  onBack,
  onRefresh,
  refreshing,
  styles,
}: {
  busy: boolean;
  onBack(): void;
  onRefresh(): void;
  refreshing: boolean;
  styles: ProfileStyles;
}): React.JSX.Element {
  const { services } = useApplication();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        testID="profile-back"
      >
        <Text style={styles.backText}>
          ‹ {services.i18n.t('auth.profile.back')}
        </Text>
      </Pressable>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={styles.title}>
          {services.i18n.t('auth.profile.title')}
        </Text>
        <ProfileButton
          busy={busy}
          label={services.i18n.t(
            refreshing ? 'auth.profile.refreshing' : 'auth.profile.refresh',
          )}
          onPress={onRefresh}
          styles={styles}
          testID="profile-refresh"
        />
      </View>
      <Text style={styles.description}>
        {services.i18n.t('auth.profile.description')}
      </Text>
    </View>
  );
}

function ProfileContent({
  profile,
  styles,
}: {
  profile: UserProfile;
  styles: ProfileStyles;
}): React.JSX.Element {
  const { services, locale } = useApplication();
  const { width, fontScale } = useWindowDimensions();
  const t = (key: string) => services.i18n.t(`auth.profile.${key}`);
  return (
    <View
      style={[
        styles.columns,
        width >= 768 && fontScale <= 1.3 && styles.wideColumns,
      ]}
      testID="profile-content"
    >
      <ProfileIdentity profile={profile} styles={styles} />
      <View style={[styles.card, styles.details]}>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t('basic')}
          </Text>
          <ProfileField
            label={t('displayName')}
            value={profile.displayName}
            styles={styles}
          />
          <ProfileField
            label={t('email')}
            value={profile.email}
            styles={styles}
          />
          <ProfileField
            label={t('phone')}
            value={profile.phone}
            styles={styles}
          />
        </View>
        <View style={[styles.section, styles.accountSection]}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t('account')}
          </Text>
          <ProfileField
            label={t('userId')}
            value={profile.id}
            styles={styles}
          />
          <ProfileField
            label={t('createdAt')}
            value={formatDate(profile.createdAt, locale)}
            styles={styles}
          />
          <ProfileField
            label={t('updatedAt')}
            value={formatDate(profile.updatedAt, locale)}
            styles={styles}
          />
        </View>
      </View>
    </View>
  );
}

function ProfileIdentity({
  profile,
  styles,
}: {
  profile: UserProfile;
  styles: ProfileStyles;
}): React.JSX.Element {
  const { brand, services } = useApplication();
  const { width, fontScale } = useWindowDimensions();
  const name =
    profile.displayName?.trim() || services.i18n.t('auth.profile.unnamed');
  const initial = Array.from(
    profile.displayName?.trim() || profile.email.trim(),
  )[0].toLocaleUpperCase();
  const statusColor = {
    ACTIVE: brand.theme.colors.success,
    DISABLED: brand.theme.colors.danger,
    LOCKED: brand.theme.colors.warning,
  }[profile.status];
  return (
    <View
      style={[
        styles.identity,
        width >= 768 && fontScale <= 1.3 && styles.wideIdentity,
      ]}
    >
      <View style={[styles.card, styles.identityCard]}>
        <View style={styles.identityTop}>
          <View accessible={false} style={styles.avatar}>
            <Text style={styles.initial}>{initial}</Text>
          </View>
          <View style={styles.identityCopy}>
            <Text selectable style={styles.name}>
              {name}
            </Text>
            <Text style={styles.identityLabel}>
              {services.i18n.t('auth.profile.title')}
            </Text>
          </View>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.fieldLabel}>
            {services.i18n.t('auth.profile.status')}
          </Text>
          <View style={styles.status}>
            <View
              style={[styles.statusDot, { backgroundColor: statusColor }]}
            />
            <Text style={styles.statusText}>
              {services.i18n.t(`auth.profile.status.${profile.status}`)}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.note}>
        {services.i18n.t('auth.profile.readOnly')}
      </Text>
    </View>
  );
}

function ProfileField({
  label,
  value,
  styles,
}: {
  label: string;
  value: string | null;
  styles: ProfileStyles;
}): React.JSX.Element {
  const { services } = useApplication();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        selectable
        style={[styles.fieldValue, !value?.trim() && styles.unset]}
      >
        {value?.trim() || services.i18n.t('auth.profile.notSet')}
      </Text>
    </View>
  );
}

function ProfileFeedback({
  loading,
  errorKey,
  onRetry,
  onSignIn,
  styles,
}: {
  loading: boolean;
  errorKey: string | null;
  onRetry(): void;
  onSignIn(): void;
  styles: ProfileStyles;
}): React.JSX.Element {
  const { brand, services } = useApplication();
  const needsLogin = errorKey === 'auth.profile.error.session';
  return (
    <View
      style={[styles.card, styles.feedback]}
      testID={loading ? 'profile-loading' : 'profile-error'}
    >
      {loading ? (
        <>
          <ActivityIndicator color={brand.theme.colors.primary} />
          <Text accessibilityLiveRegion="polite" style={styles.description}>
            {services.i18n.t('auth.profile.loading')}
          </Text>
        </>
      ) : (
        <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {services.i18n.t('auth.profile.error.title')}
          </Text>
          <Text accessibilityRole="alert" style={styles.description}>
            {services.i18n.t(errorKey || 'auth.profile.error.failed')}
          </Text>
          <ProfileButton
            label={services.i18n.t(
              needsLogin ? 'auth.profile.signIn' : 'auth.profile.retry',
            )}
            onPress={needsLogin ? onSignIn : onRetry}
            styles={styles}
            testID="profile-retry"
          />
        </>
      )}
    </View>
  );
}

function RefreshError({
  errorKey,
  styles,
}: {
  errorKey: string;
  styles: ProfileStyles;
}): React.JSX.Element {
  const { services } = useApplication();
  return (
    <View
      accessibilityRole="alert"
      style={styles.errorNotice}
      testID="profile-refresh-error"
    >
      <Text style={styles.errorText}>{services.i18n.t(errorKey)}</Text>
      <Text style={styles.description}>
        {services.i18n.t('auth.profile.refreshFailed')}
      </Text>
    </View>
  );
}

function ProfileButton({
  busy = false,
  label,
  onPress,
  styles,
  testID,
}: {
  busy?: boolean;
  label: string;
  onPress(): void;
  styles: ProfileStyles;
  testID: string;
}): React.JSX.Element {
  const [focused, setFocused] = React.useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        focused && styles.buttonFocused,
        busy && styles.disabled,
        pressed && !busy && styles.pressed,
      ]}
      testID={testID}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function formatDate(value: string, locale: string): string {
  // Android 的 best-fit 可能将 zh-CN 回退为系统语言；Hermes 修复并通过设备验收后可移除此选项。
  return new Intl.DateTimeFormat(locale, {
    localeMatcher: 'lookup',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function createStyles(theme: ThemeTokens) {
  const { colors, spacing, radius, typography } = theme;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    container: {
      flexGrow: 1,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
    },
    inner: { width: '100%', maxWidth: 960, alignSelf: 'center' },
    header: { gap: spacing.sm, marginBottom: spacing.lg },
    back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
    backText: { color: colors.textMuted, fontSize: 13 },
    titleRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    title: {
      color: colors.text,
      fontSize: typography.titleSize,
      lineHeight: 36,
      fontWeight: '600',
    },
    description: {
      color: colors.textMuted,
      fontSize: typography.bodySize,
      lineHeight: 23,
    },
    columns: { gap: spacing.lg },
    wideColumns: { flexDirection: 'row', alignItems: 'flex-start' },
    identity: { gap: spacing.sm },
    wideIdentity: { width: 248 },
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
    },
    identityCard: { padding: spacing.lg, gap: spacing.lg },
    identityTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    identityCopy: { flex: 1, gap: spacing.xs },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: radius.lg,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initial: { color: colors.primary, fontSize: 24, fontWeight: '600' },
    name: {
      color: colors.text,
      fontSize: 18,
      lineHeight: 26,
      fontWeight: '600',
    },
    identityLabel: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
    statusRow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: spacing.md,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusText: {
      color: colors.text,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    note: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 20,
      paddingHorizontal: spacing.xs,
    },
    details: { flex: 1, minWidth: 0 },
    section: { padding: spacing.lg, gap: spacing.lg },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      lineHeight: 26,
      fontWeight: '600',
    },
    accountSection: {
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    field: { gap: spacing.xs },
    fieldLabel: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
    fieldValue: {
      color: colors.text,
      fontSize: typography.bodySize,
      lineHeight: 24,
    },
    unset: { color: colors.textMuted },
    button: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonFocused: { borderColor: colors.primary },
    buttonText: {
      color: colors.primary,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '600',
    },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.65 },
    feedback: {
      minHeight: 240,
      padding: spacing.lg,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
    },
    errorNotice: {
      borderLeftWidth: 3,
      borderLeftColor: colors.danger,
      paddingLeft: spacing.md,
      gap: spacing.xs,
      marginBottom: spacing.lg,
    },
    errorText: {
      color: colors.danger,
      fontSize: typography.bodySize,
      lineHeight: 23,
    },
  });
}
