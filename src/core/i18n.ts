export type TranslationValues = Record<string, string | number>;

export class I18n {
  private locale: string;
  private readonly catalogs = new Map<string, Record<string, string>>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly defaultLocale: string) {
    this.locale = defaultLocale;
  }

  add(locale: string, messages: Record<string, string>): void {
    const catalogLocale = this.findExactCatalogLocale(locale) ?? locale;
    this.catalogs.set(catalogLocale, {
      ...this.catalogs.get(catalogLocale),
      ...messages,
    });
  }

  getLocale(): string {
    return this.locale;
  }

  getAvailableLocales(): string[] {
    return [...this.catalogs.keys()];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setLocale(locale: string): void {
    const nextLocale = this.findCatalogLocale(locale) ?? locale;
    if (nextLocale === this.locale) {
      return;
    }
    this.locale = nextLocale;
    for (const listener of this.listeners) {
      listener();
    }
  }

  t(key: string, values: TranslationValues = {}): string {
    const template =
      this.getMessage(this.locale, key) ??
      this.getMessage(this.defaultLocale, key) ??
      key;

    return Object.entries(values).reduce(
      (message, [name, value]) =>
        message.replaceAll(`{${name}}`, String(value)),
      template,
    );
  }

  private getMessage(locale: string, key: string): string | undefined {
    const catalogLocale = this.findCatalogLocale(locale);
    return catalogLocale ? this.catalogs.get(catalogLocale)?.[key] : undefined;
  }

  private findCatalogLocale(locale: string): string | undefined {
    const normalized = normalizeLocale(locale);
    const exact = this.findExactCatalogLocale(locale);
    if (exact) {
      return exact;
    }

    const language = normalized.split('-')[0];
    return [...this.catalogs.keys()].find(
      candidate => normalizeLocale(candidate).split('-')[0] === language,
    );
  }

  private findExactCatalogLocale(locale: string): string | undefined {
    const normalized = normalizeLocale(locale);
    return [...this.catalogs.keys()].find(
      candidate => normalizeLocale(candidate) === normalized,
    );
  }
}

export function findSupportedLocale(
  locale: string,
  supportedLocales: readonly string[],
): string | undefined {
  const normalized = normalizeLocale(locale);
  const exact = supportedLocales.find(
    candidate => normalizeLocale(candidate) === normalized,
  );
  if (exact) {
    return exact;
  }

  const language = normalized.split('-')[0];
  return supportedLocales.find(
    candidate => normalizeLocale(candidate).split('-')[0] === language,
  );
}

function normalizeLocale(locale: string): string {
  return locale.trim().replaceAll('_', '-').toLowerCase();
}
