import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { useApplication } from '../../app/ApplicationProvider';
import { useAppNavigation } from '../../app/navigation';
import type { ThemeTokens } from '../../brand/types';
import { ApiError } from '../../core/http';
import { AuthRepository } from './repository';
import { useRegistration } from './useRegistration';

export function AccountPasswordLoginScreen(): React.JSX.Element {
  const { brand, services } = useApplication();
  const navigate = useAppNavigation();
  const styles = useMemo(() => createStyles(brand.theme), [brand.theme]);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const login = useAccountPasswordLogin(account, password);

  return (
    <AuthMethodLayout
      description={services.i18n.t('auth.login.accountPassword.description')}
      styles={styles}
      title={services.i18n.t('auth.login.accountPassword.title')}
    >
      <AuthField
        label={services.i18n.t('auth.login.email.label')}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        editable={!login.submitting}
        keyboardType="email-address"
        onChangeText={setAccount}
        placeholder={services.i18n.t('auth.login.email.placeholder')}
        placeholderTextColor={brand.theme.colors.textMuted}
        styles={styles}
        testID="account-login-account"
        value={account}
      />
      <AuthField
        label={services.i18n.t('auth.login.password.label')}
        autoCapitalize="none"
        autoComplete="current-password"
        autoCorrect={false}
        editable={!login.submitting}
        onChangeText={setPassword}
        onSubmitEditing={login.submit}
        placeholder={services.i18n.t('auth.login.password.placeholder')}
        placeholderTextColor={brand.theme.colors.textMuted}
        secureTextEntry
        styles={styles}
        testID="account-login-password"
        value={password}
      />
      {login.errorKey ? (
        <Text
          accessibilityRole="alert"
          style={styles.formError}
          testID="account-login-error"
        >
          {services.i18n.t(login.errorKey)}
        </Text>
      ) : null}
      <ActionButton
        busy={login.submitting}
        disabled={login.submitting || !account.trim() || !password}
        label={services.i18n.t(
          login.submitting ? 'auth.login.submitting' : 'auth.login.submit',
        )}
        onPress={login.submit}
        styles={styles}
        testID="account-login-submit"
      />
      <LinkButton
        label={services.i18n.t('auth.register.link')}
        onPress={() => navigate('Register')}
        styles={styles}
        testID="account-login-register"
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

export function RegisterScreen(): React.JSX.Element {
  const { brand, services } = useApplication();
  const navigate = useAppNavigation();
  const styles = useMemo(() => createStyles(brand.theme), [brand.theme]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const registration = useRegistration({
    email,
    password,
    confirmPassword,
    displayName,
  });

  return (
    <RegistrationKeyboardLayout styles={styles}>
      <AuthMethodLayout
        description={services.i18n.t('auth.register.description')}
        styles={styles}
        title={services.i18n.t('auth.register.title')}
      >
        <AuthField
          label={services.i18n.t('auth.login.email.label')}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!registration.submitting}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder={services.i18n.t('auth.login.email.placeholder')}
          placeholderTextColor={brand.theme.colors.textMuted}
          styles={styles}
          testID="register-email"
          value={email}
        />
        <AuthField
          label={services.i18n.t('auth.register.password.label')}
          hint={services.i18n.t('auth.register.password.hint')}
          autoCapitalize="none"
          autoComplete="new-password"
          autoCorrect={false}
          editable={!registration.submitting}
          onChangeText={setPassword}
          placeholder={services.i18n.t('auth.register.password.placeholder')}
          placeholderTextColor={brand.theme.colors.textMuted}
          secureTextEntry
          styles={styles}
          testID="register-password"
          value={password}
        />
        <AuthField
          label={services.i18n.t('auth.register.confirmPassword.label')}
          autoCapitalize="none"
          autoComplete="new-password"
          autoCorrect={false}
          editable={!registration.submitting}
          onChangeText={setConfirmPassword}
          placeholder={services.i18n.t(
            'auth.register.confirmPassword.placeholder',
          )}
          placeholderTextColor={brand.theme.colors.textMuted}
          secureTextEntry
          styles={styles}
          testID="register-confirm-password"
          value={confirmPassword}
        />
        <AuthField
          label={services.i18n.t('auth.register.displayName.label')}
          autoComplete="nickname"
          editable={!registration.submitting}
          onChangeText={setDisplayName}
          onSubmitEditing={registration.submit}
          placeholder={services.i18n.t('auth.register.displayName.placeholder')}
          placeholderTextColor={brand.theme.colors.textMuted}
          returnKeyType="done"
          styles={styles}
          testID="register-display-name"
          value={displayName}
        />
        {registration.errorKey ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.formError}
            testID="register-error"
          >
            {services.i18n.t(registration.errorKey)}
          </Text>
        ) : null}
        <ActionButton
          busy={registration.submitting}
          disabled={registration.submitting || !registration.canSubmit}
          label={services.i18n.t(
            registration.submitting
              ? 'auth.register.submitting'
              : 'auth.register.submit',
          )}
          onPress={registration.submit}
          styles={styles}
          testID="register-submit"
        />
        <LinkButton
          label={services.i18n.t('auth.register.backToLogin')}
          onPress={() => navigate('AccountPasswordLogin')}
          styles={styles}
          testID="register-login-link"
        />
      </AuthMethodLayout>
    </RegistrationKeyboardLayout>
  );
}

function RegistrationKeyboardLayout({
  children,
  styles,
}: React.PropsWithChildren<{
  styles: ReturnType<typeof createStyles>;
}>): React.JSX.Element {
  const container = useRef<View>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  return (
    <View
      collapsable={false}
      onLayout={() => {
        // 键盘坐标相对窗口，表单位于应用头部下方，需要使用实际的顶部偏移。
        container.current?.measureInWindow((_x, y) => setKeyboardOffset(y));
      }}
      ref={container}
      style={styles.root}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
        style={styles.root}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

function useAccountPasswordLogin(email: string, password: string) {
  const { services } = useApplication();
  const navigate = useAppNavigation();
  const repository = useMemo(
    () => new AuthRepository(services.http),
    [services.http],
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      // 离开登录页后，迟到的响应不能切换当前账号或页面。
      mounted.current = false;
    };
  }, []);

  const submit = async (): Promise<void> => {
    const canSubmit = !inFlight.current && !!email.trim() && !!password;
    if (!canSubmit) {
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorKey('auth.login.error.email');
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setErrorKey(null);
    services.analytics.track('account_password_login_submitted');
    try {
      const session = await repository.login(email, password);
      if (!mounted.current) {
        return;
      }
      await services.session.setSession(session);
      if (mounted.current) {
        navigate('Home');
      }
    } catch (error) {
      if (mounted.current) {
        setErrorKey(loginErrorKey(error));
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setSubmitting(false);
      }
    }
  };

  return { submitting, errorKey, submit };
}

function loginErrorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'auth.login.error.rateLimited';
    }
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
      case 'USER_NOT_FOUND':
      case 'UNAUTHORIZED':
        return 'auth.login.error.credentials';
      case 'USER_DISABLED':
      case 'PERMISSION_DENIED':
        return 'auth.login.error.disabled';
      case 'VALIDATION_FAILED':
        return 'auth.login.error.validation';
    }
  }
  return 'auth.login.error.failed';
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
      <AuthField
        label={services.i18n.t('auth.login.phone.label')}
        autoComplete="tel"
        keyboardType="phone-pad"
        onChangeText={setPhone}
        placeholder={services.i18n.t('auth.login.phone.placeholder')}
        placeholderTextColor={brand.theme.colors.textMuted}
        styles={styles}
        testID="phone-login-phone"
        value={phone}
      />
      <View style={styles.codeRow}>
        <View style={styles.codeInputContainer}>
          <AuthField
            label={services.i18n.t('auth.login.code.label')}
            keyboardType="number-pad"
            onChangeText={setCode}
            placeholder={services.i18n.t('auth.login.code.placeholder')}
            placeholderTextColor={brand.theme.colors.textMuted}
            styles={styles}
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
          <Text
            style={[
              styles.codeButtonText,
              !phone.trim() && styles.codeButtonTextMuted,
            ]}
          >
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
      <AuthField
        label={services.i18n.t('auth.login.forgotPassword.identifierLabel')}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setAccount}
        placeholder={services.i18n.t('auth.login.account.placeholder')}
        placeholderTextColor={brand.theme.colors.textMuted}
        styles={styles}
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
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.formCard}>
        <Text accessibilityRole="header" style={styles.formTitle}>
          {title}
        </Text>
        <Text style={styles.formDescription}>{description}</Text>
        <View style={styles.formFields}>{children}</View>
      </View>
    </ScrollView>
  );
}

function AuthField({
  label,
  hint,
  styles,
  onBlur,
  onFocus,
  ...inputProps
}: Omit<TextInputProps, 'style'> & {
  label: string;
  hint?: string;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        accessibilityLabel={inputProps.accessibilityLabel ?? label}
        accessibilityHint={hint}
        onBlur={event => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={event => {
          setFocused(true);
          onFocus?.(event);
        }}
        style={[
          styles.input,
          hint && styles.inputWithHint,
          focused && styles.inputFocused,
        ]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </>
  );
}

function ActionButton({
  busy = false,
  disabled,
  label,
  onPress,
  styles,
  testID,
}: {
  busy?: boolean;
  disabled: boolean;
  label: string;
  onPress(): void;
  styles: ReturnType<typeof createStyles>;
  testID: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.formButton,
        disabled && styles.formButtonDisabled,
        pressed && !disabled && styles.formButtonPressed,
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.formButtonText,
          disabled && styles.formButtonTextDisabled,
        ]}
      >
        {label}
      </Text>
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
      paddingVertical: theme.spacing.xl,
    },
    formCard: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      padding: theme.spacing.lg,
      borderRadius: theme.radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#101828',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 2,
    },
    formTitle: {
      color: colors.text,
      fontSize: theme.typography.titleSize,
      lineHeight: 36,
      fontWeight: '600',
      letterSpacing: -0.4,
    },
    formDescription: {
      color: colors.textMuted,
      fontSize: theme.typography.bodySize,
      lineHeight: 23,
      marginTop: theme.spacing.sm,
    },
    formFields: { marginTop: theme.spacing.lg },
    formError: {
      color: colors.danger,
      fontSize: theme.typography.bodySize,
      lineHeight: 22,
      marginBottom: theme.spacing.sm,
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 6,
    },
    input: {
      minHeight: 48,
      color: colors.text,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.md,
      fontSize: 15,
    },
    inputFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    inputWithHint: { marginBottom: theme.spacing.xs },
    fieldHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 20,
      marginBottom: theme.spacing.md,
    },
    formButton: {
      minHeight: 48,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      marginTop: theme.spacing.sm,
    },
    formButtonDisabled: { backgroundColor: colors.border },
    formButtonPressed: { backgroundColor: colors.primaryPressed },
    formButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    formButtonTextDisabled: { color: colors.textMuted },
    linkButton: {
      alignSelf: 'center',
      minHeight: 44,
      paddingHorizontal: theme.spacing.md,
      justifyContent: 'center',
      marginTop: theme.spacing.sm,
    },
    linkButtonText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
    codeRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: theme.spacing.sm,
    },
    codeInputContainer: { flex: 1 },
    codeButton: {
      minHeight: 48,
      borderRadius: 8,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      marginBottom: theme.spacing.md,
    },
    codeButtonMuted: { backgroundColor: colors.border },
    codeButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
    codeButtonTextMuted: { color: colors.textMuted },
  });
}
