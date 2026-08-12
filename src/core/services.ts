import type {BrandConfig} from '../brand/types';
import {SessionManager, InMemorySessionStore} from './auth';
import {MemoryCache} from './cache';
import {HttpClient} from './http';
import {I18n} from './i18n';
import {ConsoleLogger} from './logger';
import {nativeCapabilities, type NativeCapabilities} from './native';
import {AppMonitor, ConsentAwareAnalytics, type Analytics, type Monitor} from './telemetry';

export interface CoreServices {
  http: HttpClient;
  cache: MemoryCache;
  session: SessionManager;
  logger: ConsoleLogger;
  analytics: Analytics;
  monitor: Monitor;
  i18n: I18n;
  native: NativeCapabilities;
}

export function createCoreServices(
  brand: BrandConfig,
  environment: keyof BrandConfig['environments'] = 'development',
): CoreServices {
  const logger = new ConsoleLogger({brandId: brand.id});
  const cache = new MemoryCache();
  const session = new SessionManager(new InMemorySessionStore());
  const env = brand.environments[environment];
  const i18n = new I18n(brand.defaultLocale);
  for (const [locale, messages] of Object.entries(brand.copy)) {
    i18n.add(locale, messages);
  }
  return {
    http: new HttpClient({baseUrl: env.apiBaseUrl, timeoutMs: env.timeoutMs, session, cache, logger}),
    cache,
    session,
    logger,
    analytics: new ConsentAwareAnalytics(logger),
    monitor: new AppMonitor(logger),
    i18n,
    native: nativeCapabilities,
  };
}
