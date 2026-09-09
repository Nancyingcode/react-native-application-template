import { useApplication } from '../../../../app/ApplicationProvider';
import { activeBrand } from '../../../../brands/generated/activeBrand';
import { createCoreServices } from '../../../../core/services';
import { authModule } from '../..';
import { logoutTranslations } from '../../logout/translations';

export const authentication = {
  user: { id: 'sms-test-user' },
  tokens: {
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    tokenType: 'Bearer',
    accessExpiresInSeconds: 900,
    refreshExpiresInSeconds: 3600,
  },
};

export function response(data: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(data), { status });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export function setupApplication() {
  const brand = {
    ...activeBrand,
    environments: {
      ...activeBrand.environments,
      development: {
        ...activeBrand.environments.development,
        apiBaseUrl: 'http://localhost:3002',
      },
    },
  };
  const services = createCoreServices(brand);
  jest.spyOn(services.logger, 'log').mockImplementation(() => undefined);
  jest.spyOn(services.analytics, 'track').mockImplementation(() => undefined);
  jest
    .spyOn(services.analytics, 'identify')
    .mockImplementation(() => undefined);
  jest.spyOn(services.analytics, 'reset').mockImplementation(() => undefined);
  const module = authModule.create({ brand, services });
  for (const [locale, messages] of Object.entries(module.translations ?? {})) {
    services.i18n.add(locale, messages);
  }
  for (const [locale, messages] of Object.entries(logoutTranslations)) {
    services.i18n.add(locale, messages);
  }
  jest.mocked(useApplication).mockReturnValue({
    brand,
    services,
    locale: brand.defaultLocale,
    environment: 'development',
    modules: [module],
    application: {
      routes: module.routes,
      menu: [],
      home: [],
      login: [],
      initialRoute: 'Home',
    },
    setLocale: jest.fn(),
    setServerFlags: jest.fn(),
  });
  return services;
}
