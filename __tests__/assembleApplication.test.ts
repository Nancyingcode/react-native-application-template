import { assembleApplication } from '../src/app/assembleApplication';
import type { BrandConfig } from '../src/brand/types';
import type { RegisteredModule } from '../src/modules/contracts';

const brand = {
  id: 'test',
  features: { markets: true, trading: true },
  assembly: {
    modules: ['markets', 'trading'],
    menu: ['menu.trading', 'menu.markets'],
    home: ['home.markets'],
    login: [],
    initialRoute: 'Home',
  },
} as unknown as BrandConfig;

const modules: RegisteredModule[] = [
  {
    id: 'markets',
    version: '1',
    routes: [
      {
        name: 'Markets',
        titleKey: 'markets',
        component: () => null,
        feature: 'markets',
      },
    ],
    menus: [
      { id: 'menu.markets', labelKey: 'markets', route: 'Markets', order: 1 },
    ],
    home: [
      { id: 'home.markets', titleKey: 'markets', route: 'Markets', order: 1 },
    ],
  },
  {
    id: 'trading',
    version: '1',
    routes: [
      {
        name: 'Trading',
        titleKey: 'trading',
        component: () => null,
        feature: 'trading',
        permissions: ['trade:write'],
      },
    ],
    menus: [
      { id: 'menu.trading', labelKey: 'trading', route: 'Trading', order: 1 },
    ],
  },
];

describe('assembleApplication', () => {
  it('honors brand order and runtime entitlements', () => {
    const result = assembleApplication(brand, modules, {
      authenticated: true,
      permissions: new Set(),
      serverFlags: {},
    });
    expect(result.initialRoute).toBe('Home');
    expect(result.routes.map(route => route.name)).toEqual(['Markets']);
    expect(result.menu.map(item => item.id)).toEqual(['menu.markets']);
    expect(result.home.map(item => item.id)).toEqual(['home.markets']);
    expect(result.login).toEqual([]);
  });

  it('assembles configured login options without exposing them on home', () => {
    const qrLoginModule: RegisteredModule = {
      id: 'qr-login',
      version: '1',
      routes: [
        {
          name: 'QrLogin',
          titleKey: 'qrLogin',
          component: () => null,
          feature: 'qrLogin',
          requiresAuth: true,
        },
      ],
      login: [
        {
          id: 'login.qrLogin',
          titleKey: 'qrLogin',
          descriptionKey: 'qrLogin.description',
          route: 'QrLogin',
          order: 1,
          feature: 'qrLogin',
        },
      ],
    };
    const loginBrand = {
      ...brand,
      features: { ...brand.features, qrLogin: true },
      assembly: {
        ...brand.assembly,
        modules: ['markets', 'qr-login'],
        login: ['login.qrLogin'],
      },
    };

    const result = assembleApplication(
      loginBrand,
      [modules[0], qrLoginModule],
      {
        authenticated: true,
        permissions: new Set(),
        serverFlags: {},
      },
    );

    expect(result.login).toEqual([
      {
        id: 'login.qrLogin',
        titleKey: 'qrLogin',
        descriptionKey: 'qrLogin.description',
        route: 'QrLogin',
      },
    ]);
    expect(result.home.map(item => item.id)).toEqual(['home.markets']);
  });

  it('does not leave a login option when its route is unavailable', () => {
    const qrLoginModule: RegisteredModule = {
      id: 'qr-login',
      version: '1',
      routes: [
        {
          name: 'QrLogin',
          titleKey: 'qrLogin',
          component: () => null,
          feature: 'qrLogin',
          requiresAuth: true,
        },
      ],
      login: [
        {
          id: 'login.qrLogin',
          titleKey: 'qrLogin',
          route: 'QrLogin',
          order: 1,
          feature: 'qrLogin',
        },
      ],
    };
    const loginBrand = {
      ...brand,
      features: { ...brand.features, qrLogin: true },
      assembly: {
        ...brand.assembly,
        modules: ['markets', 'qr-login'],
        login: ['login.qrLogin'],
      },
    };

    const result = assembleApplication(
      loginBrand,
      [modules[0], qrLoginModule],
      {
        authenticated: false,
        permissions: new Set(),
        serverFlags: {},
      },
    );

    expect(result.routes.map(route => route.name)).toEqual(['Markets']);
    expect(result.login).toEqual([]);
  });

  it('uses the configured route when it is visible', () => {
    const tradingBrand = {
      ...brand,
      assembly: { ...brand.assembly, initialRoute: 'Trading' },
    };
    const result = assembleApplication(tradingBrand, modules, {
      authenticated: true,
      permissions: new Set(['trade:write']),
      serverFlags: {},
    });

    expect(result.initialRoute).toBe('Trading');
  });

  it('falls back to the first visible route when the configured route is hidden', () => {
    const tradingBrand = {
      ...brand,
      assembly: { ...brand.assembly, initialRoute: 'Trading' },
    };
    const result = assembleApplication(tradingBrand, modules, {
      authenticated: true,
      permissions: new Set(),
      serverFlags: {},
    });

    expect(result.initialRoute).toBe('Markets');
  });
});
