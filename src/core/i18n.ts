export class I18n {
  private locale: string;
  private readonly catalogs = new Map<string, Record<string, string>>();

  constructor(defaultLocale: string) {
    this.locale = defaultLocale;
  }

  add(locale: string, messages: Record<string, string>): void {
    this.catalogs.set(locale, {...this.catalogs.get(locale), ...messages});
  }

  setLocale(locale: string): void {
    this.locale = locale;
  }

  t(key: string, values: Record<string, string | number> = {}): string {
    const template = this.catalogs.get(this.locale)?.[key] ?? key;
    return Object.entries(values).reduce(
      (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
      template,
    );
  }
}
