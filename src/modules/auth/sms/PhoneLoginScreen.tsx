import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation } from '../../../app/navigation';
import {
  AuthMethodLayout,
  AuthField,
  ActionButton,
  LinkButton,
  createStyles,
} from '../shared/form';
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
