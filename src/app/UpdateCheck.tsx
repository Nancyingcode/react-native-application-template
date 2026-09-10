import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApplication } from './ApplicationProvider';
import { ota } from '../core/ota';
import { queryUpdate } from '../core/ota/query';

export function UpdateCheck(): React.JSX.Element {
  const { brand, environment, locale } = useApplication();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const chinese = locale.toLowerCase().startsWith('zh');
  const colors = brand.theme.colors;
  const label = chinese ? '检查更新' : 'Check for updates';

  async function check(): Promise<void> {
    if (inFlight.current) return;
    const endpoint = brand.environments[environment].otaQueryUrl;
    if (!endpoint) {
      setMessage(
        chinese ? '暂未开放在线更新。' : 'Online updates are not configured.',
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      const status = await ota.getStatus();
      if (!status.supported) {
        setMessage(
          chinese
            ? '当前安装包不支持在线更新。'
            : 'This build does not support online updates.',
        );
        return;
      }
      if (status.pendingVersion > 0) {
        setMessage(
          chinese
            ? '更新已准备好，请关闭并重新打开应用。'
            : 'An update is ready. Close and reopen the app.',
        );
        return;
      }
      const result = await queryUpdate(endpoint, status);
      if (result.updateAvailable) {
        setMessage(
          chinese
            ? `发现可用更新：${result.bundleVersion}`
            : `Update available: ${result.bundleVersion}`,
        );
      } else {
        setMessage(chinese ? '暂无可用更新。' : 'No updates available.');
      }
    } catch {
      setMessage(
        chinese
          ? '检查失败，请稍后重试。'
          : 'Unable to check. Please try again.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable
        testID="ota-check-update"
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={check}
        style={({ pressed }) => [
          styles.button,
          {
            borderColor: colors.border,
            backgroundColor: pressed ? colors.background : colors.surface,
          },
        ]}
      >
        <Text style={{ color: colors.primary }}>
          {busy ? (chinese ? '正在检查…' : 'Checking…') : label}
        </Text>
      </Pressable>
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.message, { color: colors.textMuted }]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, marginBottom: 20 },
  button: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  message: { fontSize: 13, lineHeight: 20 },
});
