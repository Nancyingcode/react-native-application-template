import type React from 'react';
import type {BrandConfig, ModuleId} from '../brand/types';
import type {CoreServices} from '../core/services';

export type AppScreenComponent = React.ComponentType<Record<string, never>>;

export interface RouteContribution {
  name: string;
  titleKey: string;
  component: AppScreenComponent;
  requiresAuth?: boolean;
  permissions?: string[];
  feature?: string;
}

export interface MenuContribution {
  id: string;
  labelKey: string;
  route: string;
  order: number;
  feature?: string;
  permissions?: string[];
}

export interface HomeContribution {
  id: string;
  titleKey: string;
  route: string;
  order: number;
  feature?: string;
  permissions?: string[];
}

export interface RegisteredModule {
  id: ModuleId;
  version: string;
  routes: RouteContribution[];
  menus?: MenuContribution[];
  home?: HomeContribution[];
  translations?: Record<string, Record<string, string>>;
  initialize?: () => Promise<void> | void;
  dispose?: () => Promise<void> | void;
}

export interface ModuleContext {
  brand: BrandConfig;
  services: CoreServices;
}

export interface AppModuleFactory {
  id: ModuleId;
  create(context: ModuleContext): RegisteredModule;
}
