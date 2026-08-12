import React from 'react';
import {ModuleScreen} from '../ui/ModuleScreen';
import type {AppModuleFactory} from './contracts';

interface SimpleModuleOptions {
  id: string;
  route: string;
  menuId: string;
  homeId: string;
  titleKey: string;
  title: string;
  eyebrow: string;
  description: string;
  action?: string;
  feature?: string;
  permissions?: string[];
  requiresAuth?: boolean;
  translations: Record<string, Record<string, string>>;
}

export function createSimpleModule(options: SimpleModuleOptions): AppModuleFactory {
  const Screen = (): React.JSX.Element => (
    <ModuleScreen
      eyebrow={options.eyebrow}
      title={options.title}
      description={options.description}
      action={options.action}
    />
  );
  Screen.displayName = `${options.id}Screen`;

  return {
    id: options.id,
    create: () => ({
      id: options.id,
      version: '1.0.0',
      routes: [
        {
          name: options.route,
          titleKey: options.titleKey,
          component: Screen,
          feature: options.feature,
          permissions: options.permissions,
          requiresAuth: options.requiresAuth,
        },
      ],
      menus: [
        {
          id: options.menuId,
          labelKey: options.titleKey,
          route: options.route,
          order: 10,
          feature: options.feature,
          permissions: options.permissions,
        },
      ],
      home: [
        {
          id: options.homeId,
          titleKey: options.titleKey,
          route: options.route,
          order: 10,
          feature: options.feature,
          permissions: options.permissions,
        },
      ],
      translations: options.translations,
    }),
  };
}
