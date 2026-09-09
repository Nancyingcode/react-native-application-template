import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation } from '../../../app/navigation';
import {
  AuthMethodLayout,
  AuthField,
  ActionButton,
  LinkButton,
  createStyles,
} from '../shared/form';
import { useSmsLogin } from './useSmsLogin';
import { SmsKeyboardLayout } from './SmsKeyboardLayout';

export function PhoneLoginScreen(): React.JSX.Element {
  const { brand, services } = useApplication();
  const navigate = useAppNavigation();
  const styles = useMemo(() => createStyles(brand.theme), [brand.theme]);
  const sms = useSmsLogin();

  return (
    <SmsKeyboardLayout styles={styles}>
      <AuthMethodLayout
        description={services.i18n.t('auth.login.phone.description')}
        styles={styles}
        title={services.i18n.t('auth.login.phone.title')}
      >
        <AuthField
          label={services.i18n.t('auth.login.phone.label')}
          autoComplete="tel"
          keyboardType="phone-pad"
          onChangeText={sms.changePhone}
          placeholder={services.i18n.t('auth.login.phone.placeholder')}
          placeholderTextColor={brand.theme.colors.textMuted}
          styles={styles}
          testID="phone-login-phone"
          value={sms.phone}
        />
        <AuthField
          label={services.i18n.t('auth.login.code.label')}
          keyboardType="number-pad"
          autoComplete="sms-otp"
          maxLength={6}
          editable={!sms.busy}
          onChangeText={sms.changeCode}
          placeholder={services.i18n.t('auth.login.code.placeholder')}
          placeholderTextColor={brand.theme.colors.textMuted}
          styles={styles}
          testID="phone-login-code"
          value={sms.code}
        />
        {sms.sent ? (
          <Text
            accessibilityLiveRegion="polite"
            style={styles.fieldHint}
            testID="phone-login-timing"
          >
            {services.i18n.t(
              sms.expiresSeconds > 0
                ? 'auth.login.code.validFor'
                : 'auth.login.phone.error.expired',
              { seconds: sms.expiresSeconds },
            )}
          </Text>
        ) : null}
        {sms.errorKey ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.formError}
            testID="phone-login-error"
          >
            {services.i18n.t(sms.errorKey)}
          </Text>
        ) : null}
        <SmsSendButton sms={sms} styles={styles} />
        <ActionButton
          busy={sms.busy === 'login'}
          disabled={!!sms.busy || !sms.phone.trim() || !sms.code}
          label={services.i18n.t(
            sms.busy === 'login'
              ? 'auth.login.code.signingIn'
              : 'auth.login.submit',
          )}
          onPress={sms.submit}
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
    </SmsKeyboardLayout>
  );
}

function SmsSendButton({
  sms,
  styles,
}: {
  sms: ReturnType<typeof useSmsLogin>;
  styles: ReturnType<typeof createStyles>;
}): React.JSX.Element {
  const { services } = useApplication();
  let labelKey = 'auth.login.code.send';
  if (sms.busy === 'send') {
    labelKey = 'auth.login.code.sending';
  } else if (sms.resendSeconds > 0) {
    labelKey = 'auth.login.code.resendAfter';
  }
  const disabled = !!sms.busy || sms.resendSeconds > 0 || !sms.phone.trim();
  const secondaryButton = {
    ...styles.formButton,
    backgroundColor: styles.input.backgroundColor,
    borderColor: styles.input.borderColor,
    borderWidth: 1,
  };
  return (
    <ActionButton
      busy={sms.busy === 'send'}
      disabled={disabled}
      label={services.i18n.t(labelKey, { seconds: sms.resendSeconds })}
      onPress={sms.sendCode}
      styles={{
        ...styles,
        formButton: secondaryButton,
        formButtonText: {
          ...styles.formButtonText,
          color: styles.linkButtonText.color,
        },
      }}
      testID="phone-login-send-code"
    />
  );
}
