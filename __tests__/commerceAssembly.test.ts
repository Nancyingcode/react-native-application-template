import aurora from '../brands/aurora/brand.config.json';
import cedar from '../brands/cedar/brand.config.json';
import { assembleApplication } from '../src/app/assembleApplication';
import type { BrandConfig } from '../src/brand/types';
import { createCoreServices } from '../src/core/services';
import { commerceModule } from '../src/modules/commerce';

it.each([aurora, cedar])(
  '$id assembles public SKU routes and releases session subscriptions',
  async raw => {
    const brand = raw as BrandConfig;
    const services = createCoreServices(brand);
    jest.spyOn(services.logger, 'log').mockImplementation(() => undefined);
    const request = jest
      .spyOn(services.http, 'request')
      .mockImplementation(async () => ({
        data: { userId: services.session.getSnapshot()?.userId, items: [] },
      }));
    const module = commerceModule.create({ brand, services });
    const assemble = (authenticated: boolean) =>
      assembleApplication(brand, [module], {
        authenticated,
        permissions: new Set(),
        serverFlags: {},
      });
    try {
      if (!brand.assembly.modules.includes('commerce')) {
        expect(assemble(false).routes).toEqual([]);
        expect(assemble(true).routes).toEqual([]);
        return;
      }
      expect(assemble(false).routes.map(route => route.name)).toEqual([
        'CommerceProducts',
        'CommerceProductDetail',
        'CommerceCart',
      ]);
      expect(assemble(true).routes.map(route => route.name)).toContain(
        'CommerceCheckout',
      );
      const authenticated = assemble(true);
      expect(authenticated.routes).toHaveLength(13);
      expect(authenticated.menu.map(menu => menu.route)).toEqual(
        expect.arrayContaining([
          'CommerceOrders',
          'CommerceCoupons',
          'CommerceAccount',
          'CommerceNotifications',
          'CommerceSeckill',
        ]),
      );
      for (const menu of authenticated.menu) {
        expect(
          authenticated.routes.some(route => route.name === menu.route),
        ).toBe(true);
      }
      for (const locale of ['zh-CN', 'en-US']) {
        for (const route of authenticated.routes) {
          expect(module.translations?.[locale]?.[route.titleKey]).toBeTruthy();
        }
      }
      expect(assemble(false).menu.map(menu => menu.route)).toEqual([
        'CommerceProducts',
        'CommerceCart',
      ]);
      await module.initialize?.();
      await Promise.resolve();
      expect(request).not.toHaveBeenCalled();
      await services.session.setSession({
        userId: 'customer-a',
        accessToken: 'test-a',
        permissions: [],
        expiresAt: Date.now() + 60000,
      });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(request).toHaveBeenCalledWith('/api/v1/cart', {});
      request.mockClear();
      await module.dispose?.();
      await services.session.setSession({
        userId: 'customer-b',
        accessToken: 'test-b',
        permissions: [],
        expiresAt: Date.now() + 60000,
      });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(request).not.toHaveBeenCalled();
    } finally {
      await module.dispose?.();
      jest.restoreAllMocks();
    }
  },
);
