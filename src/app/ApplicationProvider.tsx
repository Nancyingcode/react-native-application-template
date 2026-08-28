import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
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
import {createCoreServices, type CoreServices} from '../core/services';
import {ModuleRegistry} from '../modules/ModuleRegistry';
import type {RegisteredModule} from '../modules/contracts';
import {assembleApplication, type AssembledApplication} from './assembleApplication';
import {useAnalyticsLifecycle} from './useAnalyticsLifecycle';

interface ApplicationContextValue {
  brand: BrandConfig;
  environment: BrandEnvironmentName;
  services: CoreServices;
  modules: RegisteredModule[];
  application: AssembledApplication;
  setServerFlags(flags: Record<string, FeatureValue>): void;
}

const ApplicationContext = createContext<ApplicationContextValue | null>(null);

export function ApplicationProvider({children}: React.PropsWithChildren): React.JSX.Element {
  const [serverFlags, setServerFlags] = useState<Record<string, FeatureValue>>({});
  const services = useMemo(
    () => createCoreServices(activeBrand, activeEnvironment, activeVersionName),
    [],
  );
  const registry = useMemo(() => {
    const moduleRegistry = new ModuleRegistry();
    for (const factory of activeModuleFactories) {
      moduleRegistry.register(factory.create({brand: activeBrand, services}));
    }
    for (const module of moduleRegistry.all()) {
      for (const [locale, messages] of Object.entries(module.translations ?? {})) {
        services.i18n.add(locale, messages);
      }
    }
    return moduleRegistry;
  }, [services]);
  const application = useMemo(() => {
    const permissions = new Set(['portfolio:read', 'trade:write', 'trade:advanced']);
    return assembleApplication(activeBrand, registry.all(), {
      serverFlags,
      permissions,
      authenticated: true,
    });
  }, [registry, serverFlags]);

  useAnalyticsLifecycle(services.analytics);

  useEffect(() => {
    registry.initialize().catch(error => services.monitor.capture(error));
    return () => {
      registry.dispose().catch(error => services.monitor.capture(error));
    };
  }, [registry, services]);

  return (
    <ApplicationContext.Provider
      value={{
        brand: activeBrand,
        environment: activeEnvironment,
        services,
        modules: registry.all(),
        application,
        setServerFlags,
      }}>
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
