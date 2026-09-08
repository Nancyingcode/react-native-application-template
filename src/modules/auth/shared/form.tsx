import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import type { ThemeTokens } from '../../../brand/types';
export function AuthMethodLayout({
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

export function AuthField({
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

export function ActionButton({
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

export function LinkButton({
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

export function createStyles(theme: ThemeTokens) {
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
