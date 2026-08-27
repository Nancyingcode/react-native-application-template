import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApplication } from '../../app/ApplicationProvider';
import { useAppNavigation } from '../../app/navigation';
import type { ThemeTokens } from '../../brand/types';

export function AccountPasswordLoginScreen(): React.JSX.Element {
  const { brand, services } = useApplication();
  const navigate = useAppNavigation();
  const styles = useMemo(() => createStyles(brand.theme), [brand.theme]);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');

  const submit = (): void => {
    if (!account.trim() || !password) {
      return;
    }
    services.analytics.track('account_password_login_submitted');
  };

  return (
    <AuthMethodLayout
      description={services.i18n.t('auth.login.accountPassword.description')}
      styles={styles}
      title={services.i18n.t('auth.login.accountPassword.title')}
    >
      <FieldLabel
        label={services.i18n.t('auth.login.account.label')}
        styles={styles}
      />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setAccount}
        placeholder={services.i18n.t('auth.login.account.placeholder')}
        placeholderTextColor={brand.theme.colors.textMuted}
        style={styles.input}
        testID="account-login-account"
        value={account}
      />
      <FieldLabel
        label={services.i18n.t('auth.login.password.label')}
        styles={styles}
      />
      <TextInput
        onChangeText={setPassword}
        placeholder={services.i18n.t('auth.login.password.placeholder')}
        placeholderTextColor={brand.theme.colors.textMuted}
        secureTextEntry
        style={styles.input}
        testID="account-login-password"
        value={password}
      />
      <ActionButton
        disabled={!account.trim() || !password}
        label={services.i18n.t('auth.login.submit')}
        onPress={submit}
        styles={styles}
        testID="account-login-submit"
      />
      <LinkButton
        label={services.i18n.t('auth.login.forgotPassword')}
        onPress={() => navigate('ForgotPassword')}
        styles={styles}
        testID="account-login-forgot"
      />
    </AuthMethodLayout>
  );
}

export function PhoneLoginScreen(): React.JSX.Element {
  const { brand, services } = useApplication();
  const navigate = useAppNavigation();
  const styles = useMemo(() => createStyles(brand.theme), [brand.theme]);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const sendCode = (): void => {
    if (!phone.trim()) {
      return;
    }
    setCodeSent(true);
    services.analytics.track('phone_login_code_requested');
  };

  const submit = (): void => {
    if (!phone.trim() || !code.trim()) {
      return;
    }
    services.analytics.track('phone_login_submitted');
  };

  return (
    <AuthMethodLayout
      description={services.i18n.t('auth.login.phone.description')}
      styles={styles}
      title={services.i18n.t('auth.login.phone.title')}
    >
      <FieldLabel
        label={services.i18n.t('auth.login.phone.label')}
        styles={styles}
      />
      <TextInput
        autoComplete="tel"
        keyboardType="phone-pad"
        onChangeText={setPhone}
        placeholder={services.i18n.t('auth.login.phone.placeholder')}
        placeholderTextColor={brand.theme.colors.textMuted}
        style={styles.input}
        testID="phone-login-phone"
        value={phone}
      />
      <View style={styles.codeRow}>
        <View style={styles.codeInputContainer}>
          <FieldLabel
            label={services.i18n.t('auth.login.code.label')}
            styles={styles}
          />
          <TextInput
            keyboardType="number-pad"
            onChangeText={setCode}
            placeholder={services.i18n.t('auth.login.code.placeholder')}
            placeholderTextColor={brand.theme.colors.textMuted}
            style={styles.input}
            testID="phone-login-code"
            value={code}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={!phone.trim()}
          onPress={sendCode}
          style={({ pressed }) => [
            styles.codeButton,
            (!phone.trim() || pressed) && styles.codeButtonMuted,
          ]}
          testID="phone-login-send-code"
        >
          <Text style={styles.codeButtonText}>
            {services.i18n.t(
              codeSent ? 'auth.login.code.sent' : 'auth.login.code.send',
            )}
          </Text>
        </Pressable>
      </View>
      <ActionButton
        disabled={!phone.trim() || !code.trim()}
        label={services.i18n.t('auth.login.submit')}
        onPress={submit}
        styles={styles}
        testID="phone-login-submit"
      />
      <LinkButton
        label={services.i18n.t('auth.login.accountPassword.link')}
        onPress={() => navigate('AccountPasswordLogin')}
        styles={styles}
        testID="phone-login-account-link"
      />
    </AuthMethodLayout>
  );
}

export function ForgotPasswordScreen(): React.JSX.Element {
  const { brand, services } = useApplication();
  const navigate = useAppNavigation();
  const styles = useMemo(() => createStyles(brand.theme), [brand.theme]);
  const [account, setAccount] = useState('');

  const submit = (): void => {
    if (!account.trim()) {
      return;
    }
    services.analytics.track('forgot_password_requested');
  };

  return (
    <AuthMethodLayout
      description={services.i18n.t('auth.login.forgotPassword.description')}
      styles={styles}
      title={services.i18n.t('auth.login.forgotPassword.title')}
    >
      <FieldLabel
        label={services.i18n.t('auth.login.forgotPassword.identifierLabel')}
        styles={styles}
      />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setAccount}
        placeholder={services.i18n.t('auth.login.account.placeholder')}
        placeholderTextColor={brand.theme.colors.textMuted}
        style={styles.input}
        testID="forgot-password-account"
        value={account}
      />
      <ActionButton
        disabled={!account.trim()}
        label={services.i18n.t('auth.login.forgotPassword.submit')}
        onPress={submit}
        styles={styles}
        testID="forgot-password-submit"
      />
      <LinkButton
        label={services.i18n.t('auth.login.backToLogin')}
        onPress={() => navigate('AccountPasswordLogin')}
        styles={styles}
        testID="forgot-password-back"
      />
    </AuthMethodLayout>
  );
}

function AuthMethodLayout({
  title,
  description,
  styles,
  children,
}: React.PropsWithChildren<{
  title: string;
  description: string;
  styles: ReturnType<typeof createStyles>;
}>): React.JSX.Element {
  return (
    <ScrollView
      contentContainerStyle={styles.formContent}
      style={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{title}</Text>
        <Text style={styles.formDescription}>{description}</Text>
        <View style={styles.formFields}>{children}</View>
      </View>
    </ScrollView>
  );
}

function FieldLabel({
  label,
  styles,
}: {
  label: string;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  return <Text style={styles.fieldLabel}>{label}</Text>;
}

function ActionButton({
  disabled,
  label,
  onPress,
  styles,
  testID,
}: {
  disabled: boolean;
  label: string;
  onPress(): void;
  styles: ReturnType<typeof createStyles>;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.formButton,
        disabled && styles.formButtonDisabled,
        pressed && styles.formButtonPressed,
      ]}
      testID={testID}
    >
      <Text style={styles.formButtonText}>{label}</Text>
    </Pressable>
  );
}

function LinkButton({
  label,
  onPress,
  styles,
  testID,
}: {
  label: string;
  onPress(): void;
  styles: ReturnType<typeof createStyles>;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.linkButton}
      testID={testID}
    >
      <Text style={styles.linkButtonText}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens) {
  const { colors } = theme;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    formContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: theme.spacing.lg,
    },
    formCard: {
      width: '100%',
      maxWidth: 520,
      alignSelf: 'center',
      padding: theme.spacing.lg,
      borderRadius: theme.radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    formTitle: {
      color: colors.text,
      fontSize: theme.typography.titleSize,
      fontWeight: '800',
    },
    formDescription: {
      color: colors.textMuted,
      fontSize: theme.typography.bodySize,
      lineHeight: 22,
      marginTop: theme.spacing.sm,
    },
    formFields: { marginTop: theme.spacing.lg },
    fieldLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: theme.spacing.xs,
    },
    input: {
      minHeight: 48,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    formButton: {
      minHeight: 50,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      marginTop: theme.spacing.sm,
    },
    formButtonDisabled: { opacity: 0.5 },
    formButtonPressed: { backgroundColor: colors.primaryPressed },
    formButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    linkButton: {
      alignSelf: 'center',
      padding: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    linkButtonText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    codeRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: theme.spacing.sm,
    },
    codeInputContainer: { flex: 1 },
    codeButton: {
      minHeight: 48,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      marginBottom: theme.spacing.md,
    },
    codeButtonMuted: { opacity: 0.5 },
    codeButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  });
}
