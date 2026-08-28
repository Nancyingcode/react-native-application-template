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
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.introduction}>
        <Text style={styles.eyebrow}>
          {services.i18n.t('auth.login.eyebrow')}
        </Text>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
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
      paddingVertical: theme.spacing.xl,
    },
    introduction: { width: '100%', maxWidth: 480, alignSelf: 'center' },
    eyebrow: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.8,
      marginBottom: theme.spacing.sm,
    },
    title: {
      color: colors.text,
      fontSize: Math.min(theme.typography.titleSize, 30),
      fontWeight: '600',
      letterSpacing: -0.4,
      marginBottom: theme.spacing.sm,
    },
    description: {
      color: colors.textMuted,
      fontSize: Math.min(theme.typography.bodySize, 15),
      lineHeight: 23,
    },
    primaryButton: {
      width: '100%',
      minHeight: 46,
      borderRadius: 8,
      marginTop: theme.spacing.lg,
      paddingHorizontal: theme.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    buttonPressed: { backgroundColor: colors.primaryPressed },
    loginOptions: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      marginTop: theme.spacing.xl,
    },
    optionsTitle: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 10,
    },
    option: {
      minHeight: 72,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      padding: theme.spacing.md,
      marginBottom: 10,
    },
    optionPressed: {
      borderColor: colors.primary,
      backgroundColor: colors.background,
    },
    optionCopy: { flex: 1, paddingRight: theme.spacing.md },
    optionTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
    optionDescription: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: theme.spacing.xs,
    },
    optionArrow: {
      width: 28,
      height: 28,
      borderRadius: 7,
      color: colors.primary,
      backgroundColor: colors.background,
      fontSize: 18,
      lineHeight: 27,
      textAlign: 'center',
    },
  });
}
