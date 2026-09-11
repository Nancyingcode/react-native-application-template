import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useApplication } from '../../app/ApplicationProvider';
import { LogoutButton } from './logout/LogoutButton';

// 退出会移除受保护的资料路由；由 Shell 保持此区域挂载，才能显示远端撤销结果。
export function ProfileSessionActions(): React.JSX.Element {
  const { brand } = useApplication();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { maxHeight: '40%', flexGrow: 0 },
        container: {
          padding: brand.theme.spacing.md,
          backgroundColor: brand.theme.colors.background,
        },
        inner: { width: '100%', maxWidth: 960, alignSelf: 'center' },
      }),
    [brand.theme],
  );
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      <View style={styles.inner}>
        <LogoutButton />
      </View>
    </ScrollView>
  );
}
