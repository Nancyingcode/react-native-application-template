import {Platform} from 'react-native';
import packageManifest from '../../package.json';
import type {BrandConfig, BrandEnvironmentName} from '../brand/types';
import {SessionManager, InMemorySessionStore} from './auth';
import {MemoryCache} from './cache';
import {HttpClient} from './http';
import {I18n} from './i18n';
import {ConsoleLogger} from './logger';
import {nativeCapabilities, type NativeCapabilities} from './native';
import {
  AnalyticsService,
  AppMonitor,
  HttpAnalyticsTransport,
  type Analytics,
  type Monitor,
} from './telemetry';

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
  environment: BrandEnvironmentName = 'development',
  appVersion = packageManifest.version,
): CoreServices {
  const logger = new ConsoleLogger({brandId: brand.id});
  const cache = new MemoryCache();
  const env = brand.environments[environment];
  const analyticsKey = brand.native.sdkKeys.analytics;
  const analytics = new AnalyticsService({
    logger,
    transport: new HttpAnalyticsTransport({
      endpoint: `${env.apiBaseUrl}/v1/analytics/events`,
      timeoutMs: env.timeoutMs,
      apiKey:
        analyticsKey && !analyticsKey.startsWith('${')
          ? analyticsKey
          : undefined,
    }),
    context: {
      app: {
        id: brand.id,
        name: brand.appName,
        version: appVersion,
      },
      device: {
        platform: Platform.OS,
        osVersion: String(Platform.Version),
      },
      locale: brand.defaultLocale,
      timezone: getTimezone(),
      channel: brand.native.channel,
    },
  });
  const session = new SessionManager(new InMemorySessionStore(), {
    onSessionChanged: nextSession => {
      if (nextSession) {
        analytics.identify(nextSession.userId);
      } else {
        analytics.reset();
      }
    },
  });
  const i18n = new I18n(brand.defaultLocale);
  for (const [locale, messages] of Object.entries(brand.copy)) {
    i18n.add(locale, messages);
  }
  return {
    http: new HttpClient({
      baseUrl: env.apiBaseUrl,
      timeoutMs: env.timeoutMs,
      session,
      cache,
      logger,
      onRequestCompleted: metric => analytics.track('http_request', {...metric}),
    }),
    cache,
    session,
    logger,
    analytics,
    monitor: new AppMonitor(logger, analytics),
    i18n,
    native: nativeCapabilities,
  };
}

function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
