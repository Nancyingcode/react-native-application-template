import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import {
  shippingAddressFields,
  type ShippingAddressFormProps,
} from './shippingAddress';

export function ShippingAddressForm({
  value,
  errors,
  disabled = false,
  onChange,
}: ShippingAddressFormProps): React.JSX.Element {
  const { brand, services } = useApplication();
  const colors = brand.theme.colors;
  const [focused, setFocused] = useState<string>();
  const t = services.i18n.t.bind(services.i18n);
  return (
    <View style={styles.form}>
      {shippingAddressFields.map(field => {
        const label = t(`commerce.checkout.address.${field.name}`);
        const error = errors?.[field.name];
        return (
          <View key={field.name} style={styles.field}>
            <Text style={[styles.label, { color: colors.text }]}>
              {label}
              {field.required
                ? ' *'
                : ` (${t('commerce.checkout.address.optional')})`}
            </Text>
            <TextInput
              accessibilityLabel={label}
              accessibilityHint={error}
              accessibilityState={{ disabled }}
              value={value[field.name] ?? ''}
              editable={!disabled}
              onChangeText={text => onChange({ ...value, [field.name]: text })}
              keyboardType={field.name === 'phone' ? 'phone-pad' : 'default'}
              autoCorrect={false}
              onFocus={() => setFocused(field.name)}
              onBlur={() => setFocused(undefined)}
              style={[
                styles.input,
                disabled && styles.disabled,
                {
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderColor: error
                    ? colors.danger
                    : focused === field.name
                    ? colors.primary
                    : colors.border,
                },
              ]}
            />
            {error ? (
              <Text accessibilityRole="alert" style={{ color: colors.danger }}>
                {error}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  disabled: { opacity: 0.6 },
  form: { gap: 16 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
});
