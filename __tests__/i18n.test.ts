import { findSupportedLocale, I18n } from '../src/core/i18n';

describe('I18n', () => {
  test('switches locale and merges messages from the same catalog', () => {
    const i18n = new I18n('zh-CN');
    i18n.add('zh-CN', { greeting: '你好' });
    i18n.add('zh-cn', { farewell: '再见' });
    i18n.add('en-US', { greeting: 'Hello', farewell: 'Goodbye' });

    expect(i18n.getLocale()).toBe('zh-CN');
    expect(i18n.t('greeting')).toBe('你好');
    expect(i18n.t('farewell')).toBe('再见');

    i18n.setLocale('en-us');
    expect(i18n.getLocale()).toBe('en-US');
    expect(i18n.t('greeting')).toBe('Hello');
  });

  test('falls back to the default catalog and then to the key', () => {
    const i18n = new I18n('zh-CN');
    i18n.add('zh-CN', { defaultOnly: '默认文案' });
    i18n.add('en-US', { englishOnly: 'English only' });
    i18n.setLocale('en-GB');

    expect(i18n.t('englishOnly')).toBe('English only');
    expect(i18n.t('defaultOnly')).toBe('默认文案');
    expect(i18n.t('missing.key')).toBe('missing.key');
  });

  test('interpolates every matching placeholder', () => {
    const i18n = new I18n('en-US');
    i18n.add('en-US', {
      summary: '{count} items, {count} selected by {name}',
    });

    expect(i18n.t('summary', { count: 2, name: 'Ada' })).toBe(
      '2 items, 2 selected by Ada',
    );
  });

  test('lists the canonical catalog locale once', () => {
    const i18n = new I18n('en-US');
    i18n.add('en-US', { first: 'First' });
    i18n.add('en-us', { second: 'Second' });

    expect(i18n.getAvailableLocales()).toEqual(['en-US']);
  });

  test('keeps regional catalogs separate', () => {
    const i18n = new I18n('zh-CN');
    i18n.add('zh-CN', { greeting: '你好' });
    i18n.add('zh-TW', { greeting: '您好' });

    i18n.setLocale('zh-TW');

    expect(i18n.getAvailableLocales()).toEqual(['zh-CN', 'zh-TW']);
    expect(i18n.t('greeting')).toBe('您好');
  });

  test('notifies subscribers only when the locale changes', () => {
    const i18n = new I18n('zh-CN');
    i18n.add('zh-CN', {});
    i18n.add('en-US', {});
    const listener = jest.fn();
    const unsubscribe = i18n.subscribe(listener);

    i18n.setLocale('zh-cn');
    i18n.setLocale('en-US');
    unsubscribe();
    i18n.setLocale('zh-CN');

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('findSupportedLocale', () => {
  const supported = ['zh-CN', 'en-US'];

  test('prefers an exact locale before matching the language', () => {
    expect(findSupportedLocale('EN_us', supported)).toBe('en-US');
    expect(findSupportedLocale('zh-HK', supported)).toBe('zh-CN');
  });

  test('returns undefined for an unsupported language', () => {
    expect(findSupportedLocale('fr-FR', supported)).toBeUndefined();
  });
});
