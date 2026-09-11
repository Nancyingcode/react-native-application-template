import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useApplication } from './ApplicationProvider';
import { ota } from '../core/ota';
import { queryUpdate } from '../core/ota/query';
import { telemetryIdentity, rememberAssignment } from '../core/ota/telemetry';

export function UpdateCheck(): React.JSX.Element {
  const { brand, environment, locale } = useApplication();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [manifestUrl, setManifestUrl] = useState<string>();
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
    setManifestUrl(undefined);
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
      const installationId = await telemetryIdentity();
      const result = await queryUpdate(endpoint, status, installationId);
      await rememberAssignment(endpoint, status, result, installationId);
      if (result.updateAvailable) {
        setManifestUrl(result.manifestUrl);
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
      {manifestUrl && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={async () => {
            if (inFlight.current) return;
            inFlight.current = true;
            setBusy(true);
            setMessage(
              chinese ? '正在下载并校验…' : 'Downloading and validating…',
            );
            try {
              await ota.stage(manifestUrl);
              setManifestUrl(undefined);
              setMessage(
                chinese
                  ? '下载完成，关闭并重新打开应用后试运行。'
                  : 'Download complete. Close and reopen to try the update.',
              );
            } catch {
              setManifestUrl(undefined);
              setMessage(
                chinese
                  ? '下载或暂存失败，请重新检查更新。'
                  : 'Download or staging failed. Check for updates again.',
              );
            } finally {
              inFlight.current = false;
              setBusy(false);
            }
          }}
          style={styles.button}
        >
          <Text style={{ color: colors.primary }}>
            {chinese ? '下载更新（下次启动生效）' : 'Download for next launch'}
          </Text>
        </Pressable>
      )}
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
