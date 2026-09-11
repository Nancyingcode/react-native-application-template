import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useApplication } from '../../../app/ApplicationProvider';
import { useAppNavigation } from '../../../app/navigation';
import { PrimaryButton } from '../shared/ui';
import type { CatalogRepository, SearchFilter, SearchSort } from './api';
import { useSearch } from './useSearch';

export function SearchPanel({
  repository,
  onClose,
}: {
  repository: CatalogRepository;
  onClose(): void;
}) {
  const { brand, services } = useApplication();
  const navigate = useAppNavigation();
  const colors = brand.theme.colors;
  const t = (key: string) => services.i18n.t(`commerce.products.search.${key}`);
  const [keyword, setKeyword] = useState('');
  const [focused, setFocused] = useState(false);
  const [filter, setFilter] = useState<SearchFilter>({ sort: 'relevance' });
  const [hot, setHot] = useState<string[]>([]);
  const [hotError, setHotError] = useState(false);
  const [hotAttempt, setHotAttempt] = useState(0);
  const results = useSearch(repository, filter);
  useEffect(() => {
    let cancelled = false;
    setHotError(false);
    repository
      .hot()
      .then(items => {
        if (!cancelled) {
          setHot([...new Set(items.map(item => item.keyword))]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHotError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hotAttempt, repository]);
  const submit = () =>
    setFilter(current => ({ ...current, keyword: keyword.trim() }));
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <SearchChoice label={t('close')} onPress={onClose} compact />
      <Text style={[styles.label, { color: colors.text }]}>{t('label')}</Text>
      <TextInput
        accessibilityLabel={t('label')}
        value={keyword}
        onChangeText={setKeyword}
        onSubmitEditing={submit}
        returnKeyType="search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            color: colors.text,
            borderColor: focused ? colors.primary : colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      />
      <PrimaryButton label={t('submit')} onPress={submit} compact />
      <Text style={[styles.label, { color: colors.text }]}>{t('hot')}</Text>
      {hotError ? (
        <SearchChoice
          label={t('hotRetry')}
          onPress={() => setHotAttempt(value => value + 1)}
          compact
        />
      ) : null}
      <View style={styles.options}>
        {hot.map(word => (
          <SearchChoice
            key={word}
            label={word}
            onPress={() => {
              setKeyword(word);
              setFilter(current => ({ ...current, keyword: word }));
            }}
            compact
          />
        ))}
      </View>
      <Text style={[styles.label, { color: colors.text }]}>{t('sort')}</Text>
      <View style={styles.options}>
        {(
          [
            'relevance',
            'sales',
            'price_asc',
            'price_desc',
            'newest',
          ] satisfies SearchSort[]
        ).map(sort => (
          <Pressable
            key={sort}
            accessibilityRole="button"
            accessibilityState={{ selected: filter.sort === sort }}
            onPress={() => setFilter(current => ({ ...current, sort }))}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor:
                  filter.sort === sort ? colors.primary : colors.border,
                backgroundColor: pressed ? colors.background : colors.surface,
              },
            ]}
          >
            <Text style={{ color: colors.text }}>{t(sort)}</Text>
          </Pressable>
        ))}
      </View>
      {filter.category ? (
        <SearchChoice
          label={t('clearCategory')}
          onPress={() =>
            setFilter(current => ({ ...current, category: undefined }))
          }
          compact
        />
      ) : null}
      {results.loading ? (
        <ActivityIndicator
          accessibilityLabel={t('loading')}
          color={colors.primary}
        />
      ) : null}
      {results.error ? (
        <SearchChoice label={t('retry')} onPress={results.refresh} compact />
      ) : null}
      {!results.loading && !results.error && results.items.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>{t('empty')}</Text>
      ) : null}
      {results.items.map(item => (
        <View
          key={item.productId}
          style={[styles.result, { borderColor: colors.border }]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              navigate('CommerceProductDetail', { productId: item.productId })
            }
            style={styles.resultLink}
          >
            <Text style={[styles.name, { color: colors.text }]}>
              {item.name}
            </Text>
            {item.subtitle ? (
              <Text style={{ color: colors.textMuted }}>{item.subtitle}</Text>
            ) : null}
            <Text style={{ color: colors.textMuted }}>{t('priceUnknown')}</Text>
          </Pressable>
          <SearchChoice
            label={`${t('category')}: ${item.categoryName}`}
            onPress={() =>
              setFilter(current => ({ ...current, category: item.categoryId }))
            }
            compact
          />
        </View>
      ))}
      {results.hasMore ? (
        <SearchChoice
          label={t('more')}
          onPress={results.loadMore}
          disabled={results.loading}
          compact
        />
      ) : null}
    </ScrollView>
  );
}
function SearchChoice({
  label,
  onPress,
  disabled,
}: Parameters<typeof PrimaryButton>[0]) {
  const { brand } = useApplication();
  const colors = brand.theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        styles.choice,
        {
          borderColor: colors.border,
          backgroundColor: pressed ? colors.background : colors.surface,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={{ color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: { alignSelf: 'flex-start', maxWidth: '100%' },
  content: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    padding: 20,
    gap: 16,
  },
  label: { fontSize: 16, fontWeight: '600' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
  },
  result: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 16,
    gap: 12,
  },
  resultLink: { gap: 8, minHeight: 44 },
  name: { fontSize: 18, fontWeight: '600' },
});
