import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useApplication} from '../app/ApplicationProvider';

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
  const {brand, services} = useApplication();
  const colors = brand.theme.colors;
  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <Text style={[styles.eyebrow, {color: colors.primary}]}>{eyebrow}</Text>
      <Text style={[styles.title, {color: colors.text}]}>{title}</Text>
      <Text style={[styles.description, {color: colors.textMuted}]}>{description}</Text>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => services.analytics.track('module_action', {title})}
          style={({pressed}) => [
            styles.button,
            {backgroundColor: pressed ? colors.primaryPressed : colors.primary},
          ]}>
          <Text style={styles.buttonText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 24, justifyContent: 'center'},
  eyebrow: {fontSize: 13, fontWeight: '700', letterSpacing: 1.2, marginBottom: 10},
  title: {fontSize: 30, fontWeight: '800', marginBottom: 12},
  description: {fontSize: 16, lineHeight: 24, maxWidth: 480},
  button: {alignSelf: 'flex-start', borderRadius: 12, marginTop: 28, paddingHorizontal: 20, paddingVertical: 13},
  buttonText: {color: '#FFFFFF', fontWeight: '700'},
});
