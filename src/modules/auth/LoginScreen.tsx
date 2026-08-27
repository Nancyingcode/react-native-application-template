import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApplication } from '../../app/ApplicationProvider';
import { useAppNavigation } from '../../app/navigation';
import type { ThemeTokens } from '../../brand/types';

export function LoginScreen(): React.JSX.Element {
  const { brand, services, application } = useApplication();
  const navigate = useAppNavigation();
  const styles = useMemo(() => createStyles(brand.theme), [brand.theme]);
  const title = services.i18n.t('auth.login.title');
  const openPrimaryLogin = (): void => {
    const primaryOption = application.login[0];
    if (primaryOption) {
      navigate(primaryOption.route);
      return;
    }
    services.analytics.track('module_action', { title });
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.introduction}>
        <Text style={styles.eyebrow}>
          {services.i18n.t('auth.login.eyebrow')}
        </Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>
          {services.i18n.t('auth.login.description')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={openPrimaryLogin}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {services.i18n.t('auth.login.primaryAction')}
          </Text>
        </Pressable>
      </View>

      {application.login.length > 0 ? (
        <View style={styles.loginOptions}>
          <Text style={styles.optionsTitle}>
            {services.i18n.t('auth.login.options')}
          </Text>
          {application.login.map(item => {
            const optionTitle = services.i18n.t(item.titleKey);
            return (
              <Pressable
                accessibilityLabel={optionTitle}
                accessibilityRole="button"
                key={item.id}
                onPress={() => navigate(item.route)}
                testID={`login-option-${item.id}`}
                style={({ pressed }) => [
                  styles.option,
                  pressed && styles.optionPressed,
                ]}
              >
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{optionTitle}</Text>
                  {item.descriptionKey ? (
                    <Text style={styles.optionDescription}>
                      {services.i18n.t(item.descriptionKey)}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.optionArrow}>→</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

function createStyles(theme: ThemeTokens) {
  const { colors } = theme;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    contentContainer: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: theme.spacing.lg,
    },
    introduction: { width: '100%', maxWidth: 520, alignSelf: 'center' },
    eyebrow: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 1.2,
      marginBottom: 10,
    },
    title: {
      color: colors.text,
      fontSize: theme.typography.titleSize,
      fontWeight: '800',
      marginBottom: 12,
    },
    description: {
      color: colors.textMuted,
      fontSize: theme.typography.bodySize,
      lineHeight: 24,
    },
    primaryButton: {
      alignSelf: 'flex-start',
      borderRadius: theme.radius.md,
      marginTop: 28,
      paddingHorizontal: 20,
      paddingVertical: 13,
      backgroundColor: colors.primary,
    },
    primaryButtonText: { color: '#FFFFFF', fontWeight: '700' },
    buttonPressed: { backgroundColor: colors.primaryPressed },
    loginOptions: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      marginTop: theme.spacing.xl,
    },
    optionsTitle: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: theme.spacing.sm,
    },
    option: {
      minHeight: 82,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.radius.md,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing.md,
    },
    optionPressed: { borderColor: colors.primary, opacity: 0.82 },
    optionCopy: { flex: 1, paddingRight: theme.spacing.md },
    optionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
    optionDescription: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: theme.spacing.xs,
    },
    optionArrow: { color: colors.primary, fontSize: 24 },
  });
}
