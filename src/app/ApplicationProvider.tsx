import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type {
  BrandConfig,
  BrandEnvironmentName,
  FeatureValue,
} from '../brand/types';
import {
  activeBrand,
  activeEnvironment,
  activeModuleFactories,
  activeVersionName,
} from '../brands/generated/activeBrand';
import { createCoreServices, type CoreServices } from '../core/services';
import { findSupportedLocale } from '../core/i18n';
import { ModuleRegistry } from '../modules/ModuleRegistry';
import type { RegisteredModule } from '../modules/contracts';
import {
  assembleApplication,
  type AssembledApplication,
} from './assembleApplication';
import { useAnalyticsLifecycle } from './useAnalyticsLifecycle';
import { ota } from '../core/ota';

interface ApplicationContextValue {
  brand: BrandConfig;
  environment: BrandEnvironmentName;
  services: CoreServices;
  locale: string;
  modules: RegisteredModule[];
  application: AssembledApplication;
  setLocale(locale: string): void;
  setServerFlags(flags: Record<string, FeatureValue>): void;
}

const ApplicationContext = createContext<ApplicationContextValue | null>(null);

export function ApplicationProvider({
  children,
}: React.PropsWithChildren): React.JSX.Element {
  const [serverFlags, setServerFlags] = useState<Record<string, FeatureValue>>(
    {},
  );
  const services = useMemo(
    () => createCoreServices(activeBrand, activeEnvironment, activeVersionName),
    [],
  );
  const registry = useMemo(() => {
    const moduleRegistry = new ModuleRegistry();
    for (const factory of activeModuleFactories) {
      moduleRegistry.register(factory.create({ brand: activeBrand, services }));
    }
    for (const module of moduleRegistry.all()) {
      for (const [locale, messages] of Object.entries(
        module.translations ?? {},
      )) {
        services.i18n.add(locale, messages);
      }
    }
    return moduleRegistry;
  }, [services]);
  const application = useMemo(() => {
    const permissions = new Set([
      'portfolio:read',
      'trade:write',
      'trade:advanced',
    ]);
    return assembleApplication(activeBrand, registry.all(), {
      serverFlags,
      permissions,
      authenticated: true,
    });
  }, [registry, serverFlags]);
  const locale = useSyncExternalStore(
    listener => services.i18n.subscribe(listener),
    () => services.i18n.getLocale(),
    () => services.i18n.getLocale(),
  );

  useAnalyticsLifecycle(services.analytics);

  const setLocale = useCallback(
    (nextLocale: string): void => {
      const supportedLocale = findSupportedLocale(
        nextLocale,
        activeBrand.supportedLocales,
      );
      if (!supportedLocale || supportedLocale === locale) {
        return;
      }
      services.i18n.setLocale(supportedLocale);
      services.analytics.setLocale(supportedLocale);
      services.analytics.track('locale_changed', {
        from: locale,
        to: supportedLocale,
      });
    },
    [locale, services],
  );

  useEffect(() => {
    let mounted = true;
    registry
      .initialize()
      .then(async () => {
        // Confirm only after the first committed UI and module initialization;
        // failed startup must leave the native trial marker available for rollback.
        if (mounted) await ota.markSuccessful();
      })
      .catch(error => services.monitor.capture(error));
    return () => {
      mounted = false;
      registry.dispose().catch(error => services.monitor.capture(error));
    };
  }, [registry, services]);

  return (
    <ApplicationContext.Provider
      value={{
        brand: activeBrand,
        environment: activeEnvironment,
        services,
        locale,
        modules: registry.all(),
        application,
        setLocale,
        setServerFlags,
      }}
    >
      {children}
    </ApplicationContext.Provider>
  );
}

export function useApplication(): ApplicationContextValue {
  const context = useContext(ApplicationContext);
  if (!context) {
    throw new Error('useApplication must be used inside ApplicationProvider');
  }
  return context;
}
