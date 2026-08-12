import React from 'react';
import { ModuleScreen } from '../../ui/ModuleScreen';
import type { AppModuleFactory } from '../contracts';

const LoginScreen = (): React.JSX.Element => (
  <ModuleScreen
    eyebrow="SECURE ACCESS"
    title="Welcome back"
    description="Sign in, refresh credentials and recover access through a brand-neutral authentication contract."
    action="Continue securely"
  />
);

export const authModule: AppModuleFactory = {
  id: 'auth',
  create: () => ({
    id: 'auth',
    version: '1.0.0',
    routes: [
      {
        name: 'Login',
        titleKey: 'module.auth.title',
        component: LoginScreen,
      },
    ],
    menus: [
      {
        id: 'menu.login',
        labelKey: 'module.auth.title',
        route: 'Login',
        order: 10,
      },
    ],
    translations: {
      'zh-CN': { 'module.auth.title': '登录' },
      'en-US': { 'module.auth.title': 'Sign in' },
    },
  }),
};
