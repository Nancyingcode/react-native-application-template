import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import type { Product } from '../catalog/types';
export function ProductImage({
  product,
  variant,
}: {
  product: Product;
  variant: 'card' | 'detail' | 'cart';
}): React.JSX.Element {
  const { brand, services } = useApplication();
  const [failedUrl, setFailedUrl] = useState<string>();
  const colors = brand.theme.colors;
  const imageStyle =
    variant === 'detail'
      ? styles.detailImage
      : variant === 'cart'
      ? styles.cartImage
      : styles.productImage;
  const compact = variant === 'cart';

  if (!product.imageUrl || failedUrl === product.imageUrl) {
    return (
      <View
        accessible
        accessibilityLabel={services.i18n.t(
          'commerce.productImage.loadFailed.accessibilityLabel',
          { name: product.name },
        )}
        accessibilityRole="image"
        style={[
          imageStyle,
          variant === 'detail' && styles.detailImageFallback,
          styles.imageFallback,
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}
      >
        {compact ? null : (
          <Text
            numberOfLines={1}
            style={[styles.imageFallbackCategory, { color: colors.primary }]}
          >
            {product.category}
          </Text>
        )}
        <Text
          numberOfLines={2}
          style={[
            styles.imageFallbackText,
            compact && styles.imageFallbackTextCompact,
            { color: colors.textMuted },
          ]}
        >
          {services.i18n.t(
            compact
              ? 'commerce.productImage.unavailable.compact'
              : 'commerce.productImage.unavailable',
          )}
        </Text>
      </View>
    );
  }

  return (
    <Image
      accessibilityLabel={services.i18n.t(
        'commerce.productImage.accessibilityLabel',
        { name: product.name },
      )}
      accessibilityRole="image"
      onError={() => setFailedUrl(product.imageUrl)}
      resizeMode="cover"
      source={{ uri: product.imageUrl }}
      style={imageStyle}
    />
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress(): void;
  disabled?: boolean;
  compact?: boolean;
}): React.JSX.Element {
  const { brand } = useApplication();
  const colors = brand.theme.colors;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact && styles.compactButton,
        {
          backgroundColor: disabled
            ? colors.border
            : pressed
            ? colors.primaryPressed
            : colors.primary,
          opacity: disabled ? 0.75 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.primaryButtonText,
          disabled
            ? { color: colors.textMuted }
            : styles.primaryButtonTextEnabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function EmptyState({
  title,
  description,
  action,
  onAction,
  success = false,
}: {
  title: string;
  description?: string;
  action: string;
  onAction(): void;
  success?: boolean;
}): React.JSX.Element {
  const { brand } = useApplication();
  const colors = brand.theme.colors;
  return (
    <View style={[styles.empty, { backgroundColor: colors.background }]}>
      <Text
        accessible={false}
        style={[
          styles.emptyIcon,
          { color: success ? colors.success : colors.primary },
        ]}
      >
        {success ? '✓' : '◇'}
      </Text>
      <Text
        accessibilityRole="header"
        style={[styles.emptyTitle, { color: colors.text }]}
      >
        {title}
      </Text>
      {description ? (
        <Text style={[styles.emptyDescription, { color: colors.textMuted }]}>
          {description}
        </Text>
      ) : null}
      <View style={styles.emptyAction}>
        <PrimaryButton label={action} onPress={onAction} compact />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  productImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#F0F2F5',
  },
  imageFallback: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  imageFallbackCategory: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    marginBottom: 3,
    textAlign: 'center',
  },
  imageFallbackText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  imageFallbackTextCompact: { fontSize: 10, lineHeight: 14 },
  detailImage: {
    width: '100%',
    aspectRatio: 1.3,
    borderRadius: 12,
    backgroundColor: '#F0F2F5',
  },
  detailImageFallback: { aspectRatio: undefined, height: 160 },
  primaryButton: {
    minHeight: 44,
    borderRadius: 8,
    marginTop: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactButton: { marginTop: 0, minWidth: 122 },
  primaryButtonText: { fontSize: 14, fontWeight: '600' },
  primaryButtonTextEnabled: { color: '#FFFFFF' },
  cartImage: {
    width: 88,
    height: 88,
    borderRadius: 8,
    backgroundColor: '#F0F2F5',
  },
  empty: {
    flex: 1,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: { fontSize: 42, fontWeight: '300', marginBottom: 12 },
  emptyTitle: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
  },
  emptyAction: { marginTop: 24 },
});
