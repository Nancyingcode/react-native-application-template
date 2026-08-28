import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApplication } from '../app/ApplicationProvider';

interface ModuleScreenProps {
  eyebrow: string;
  title: string;
  description: string;
  action?: string;
}

export function ModuleScreen({
  eyebrow,
  title,
  description,
  action,
}: ModuleScreenProps): React.JSX.Element {
  const { brand, services } = useApplication();
  const colors = brand.theme.colors;
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      <View
        style={[
          styles.panel,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.eyebrow, { color: colors.primary }]}>
          {eyebrow}
        </Text>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {title}
        </Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>
          {description}
        </Text>
        {action ? (
          <Pressable
            accessibilityLabel={action}
            accessibilityRole="button"
            onPress={() => services.analytics.track('module_action', { title })}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: pressed
                  ? colors.primaryPressed
                  : colors.primary,
              },
            ]}
          >
            <Text style={styles.buttonText}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 24,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  title: { fontSize: 28, lineHeight: 36, fontWeight: '600', marginBottom: 10 },
  description: { fontSize: 15, lineHeight: 23, maxWidth: 520 },
  button: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: 8,
    marginTop: 24,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
