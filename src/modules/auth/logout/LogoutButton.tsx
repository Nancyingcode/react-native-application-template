import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import type { ThemeTokens } from '../../../brand/types';
import { ActionButton, createStyles, LinkButton } from '../shared/form';
import { useLogout } from './useLogout';

export function LogoutButton(): React.JSX.Element {
  const { brand, services } = useApplication();
  const styles = useMemo(() => createStyles(brand.theme), [brand.theme]);
  const localStyles = useMemo(() => logoutStyles(brand.theme), [brand.theme]);
  const logout = useLogout();
  return (
    <View>
      <ActionButton
        busy={logout.busy}
        disabled={!logout.canLogout}
        label={services.i18n.t(
          logout.busy ? 'auth.logout.pending' : 'auth.logout.button',
        )}
        onPress={logout.request}
        styles={styles}
        testID="logout-button"
      />
      {logout.result ? (
        <Text
          accessibilityLiveRegion="polite"
          style={localStyles.feedback}
          testID="logout-result"
        >
          {services.i18n.t(`auth.logout.${logout.result}`)}
        </Text>
      ) : null}
      <Modal
        animationType="fade"
        transparent
        visible={logout.confirming}
        onRequestClose={logout.cancel}
      >
        <ScrollView contentContainerStyle={localStyles.backdrop}>
          <View accessibilityViewIsModal style={styles.formCard}>
            <Text accessibilityRole="header" style={styles.formTitle}>
              {services.i18n.t('auth.logout.title')}
            </Text>
            <Text style={styles.formDescription}>
              {services.i18n.t('auth.logout.description')}
            </Text>
            <ActionButton
              disabled={logout.busy}
              label={services.i18n.t('auth.logout.confirm')}
              onPress={logout.confirm}
              styles={styles}
              testID="logout-confirm"
            />
            <LinkButton
              label={services.i18n.t('auth.logout.cancel')}
              onPress={logout.cancel}
              styles={styles}
              testID="logout-cancel"
            />
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

function logoutStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    backdrop: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: theme.spacing.lg,
      backgroundColor: '#00000066',
    },
    feedback: {
      color: theme.colors.text,
      fontSize: theme.typography.bodySize,
      lineHeight: 24,
      marginTop: theme.spacing.md,
    },
  });
}
