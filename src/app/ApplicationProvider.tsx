import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import type {BrandConfig, FeatureValue} from '../brand/types';
import {activeBrand, activeModuleFactories} from '../brands/generated/activeBrand';
import {createCoreServices, type CoreServices} from '../core/services';
import {ModuleRegistry} from '../modules/ModuleRegistry';
import type {RegisteredModule} from '../modules/contracts';
import {assembleApplication, type AssembledApplication} from './assembleApplication';

interface ApplicationContextValue {
  brand: BrandConfig;
  services: CoreServices;
  modules: RegisteredModule[];
  application: AssembledApplication;
  setServerFlags(flags: Record<string, FeatureValue>): void;
}

const ApplicationContext = createContext<ApplicationContextValue | null>(null);

export function ApplicationProvider({children}: React.PropsWithChildren): React.JSX.Element {
  const [serverFlags, setServerFlags] = useState<Record<string, FeatureValue>>({});
  const value = useMemo(() => {
    const services = createCoreServices(activeBrand);
    const registry = new ModuleRegistry();
    for (const factory of activeModuleFactories) {
      registry.register(factory.create({brand: activeBrand, services}));
    }
    for (const module of registry.all()) {
      for (const [locale, messages] of Object.entries(module.translations ?? {})) {
        services.i18n.add(locale, messages);
      }
    }
    const permissions = new Set(['portfolio:read', 'trade:write', 'trade:advanced']);
    const application = assembleApplication(activeBrand, registry.all(), {
      serverFlags,
      permissions,
      authenticated: true,
    });
    return {brand: activeBrand, services, modules: registry.all(), application, registry};
  }, [serverFlags]);

  useEffect(() => {
    value.registry.initialize().catch(error => value.services.monitor.capture(error));
    return () => {
      value.registry.dispose().catch(error => value.services.monitor.capture(error));
    };
  }, [value]);

  return (
    <ApplicationContext.Provider value={{...value, setServerFlags}}>
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
