import React from 'react';
import { TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import aurora from '../brands/aurora/brand.config.json';
import cedar from '../brands/cedar/brand.config.json';
import { useApplication } from '../src/app/ApplicationProvider';
import { AppNavigationProvider } from '../src/app/navigation';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { createCoreServices } from '../src/core/services';
import { checkoutTranslations } from '../src/modules/commerce/checkout/translations';
import { ShippingAddressForm } from '../src/modules/commerce/checkout/ShippingAddressForm';
import { PrimaryButton } from '../src/modules/commerce/shared/ui';
import { SeckillStore } from '../src/modules/commerce/seckill/SeckillStore';
import { createSeckillScreens } from '../src/modules/commerce/seckill/screens';
import { seckillTranslations } from '../src/modules/commerce/seckill/translations';
import type { SeckillPort } from '../src/modules/commerce/seckill/types';
import {
  activity,
  address,
  deferred,
  now,
} from '../src/modules/commerce/seckill/testing/fixtures';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

describe.each([aurora, cedar])(
  'seckill themed interaction %s',
  configuration => {
    it.each(['zh-CN', 'en-US'])(
      'uses the shared address form and displays queue receipt without navigation (%s)',
      async locale => {
        jest.spyOn(Date, 'now').mockReturnValue(now);
        const brand = { ...activeBrand, theme: configuration.theme };
        const services = createCoreServices(brand);
        services.analytics.identify = jest.fn();
        for (const translations of [
          checkoutTranslations,
          seckillTranslations,
        ]) {
          for (const [language, messages] of Object.entries(translations)) {
            services.i18n.add(language, messages);
          }
        }
        services.i18n.setLocale(locale);
        jest
          .mocked(useApplication)
          .mockReturnValue({ brand, services, locale } as ReturnType<
            typeof useApplication
          >);
        await services.session.setSession({
          userId: 'a',
          accessToken: 'token',
          expiresAt: now + 60000,
          permissions: [],
        });
        const repository: jest.Mocked<SeckillPort> = {
          list: jest.fn().mockResolvedValue([activity]),
          get: jest.fn().mockResolvedValue(activity),
          token: jest.fn().mockResolvedValue({
            token: 'private',
            expiresAt: new Date(now + 50000).toISOString(),
          }),
          request: jest
            .fn()
            .mockResolvedValue({ status: 'QUEUED', requestId: 'request-1' }),
        };
        const store = new SeckillStore(
          repository,
          services.session,
          () => 'TEST 100',
        );
        const { SeckillDetailScreen } = createSeckillScreens(repository, store);
        const navigate = jest.fn();
        let renderer!: Renderer.ReactTestRenderer;
        await act(async () => {
          renderer = Renderer.create(
            <AppNavigationProvider
              navigate={navigate}
              params={{ activityId: activity.id }}
            >
              <SeckillDetailScreen />
            </AppNavigationProvider>,
          );
        });
        expect(store.getSnapshot().activity).toEqual(activity);
        expect(JSON.stringify(renderer.toJSON())).toContain(activity.name);
        const t = (key: string) => services.i18n.t(`commerce.seckill.${key}`);
        const button = (key: string) =>
          renderer.root
            .findAllByType(PrimaryButton)
            .find(node => node.props.label === t(key))!;
        await act(async () =>
          renderer.root
            .findAllByProps({ accessibilityRole: 'radio' })
            .find(node => typeof node.props.onPress === 'function')!
            .props.onPress(),
        );
        expect(renderer.root.findByType(ShippingAddressForm)).toBeDefined();
        expect(button('submit').props.disabled).toBe(true);
        await act(async () => button('token').props.onPress());
        await act(async () => button('submit').props.onPress());
        expect(repository.request).not.toHaveBeenCalled();
        expect(
          renderer.root.findByType(ShippingAddressForm).props.errors.recipient,
        ).toBe(services.i18n.t('commerce.checkout.address.required'));
        await act(async () =>
          renderer.root.findByType(ShippingAddressForm).props.onChange(address),
        );
        const quantity = renderer.root
          .findAllByType(TextInput)
          .find(node => node.props.accessibilityLabel === t('quantity'))!;
        await act(async () => quantity.props.onChangeText('4'));
        await act(async () => button('submit').props.onPress());
        expect(repository.request).not.toHaveBeenCalled();
        await act(async () => quantity.props.onChangeText('2'));
        await act(async () => button('submit').props.onPress());
        expect(repository.request).toHaveBeenCalledTimes(1);
        const json = JSON.stringify(renderer.toJSON());
        expect(json).toContain(t('queued'));
        expect(json).toContain('request-1');
        expect(json).not.toContain('private');
        expect(navigate).not.toHaveBeenCalled();
        await act(async () => renderer.unmount());
        store.dispose();
        jest.restoreAllMocks();
      },
    );
  },
);

it('keeps loading/error/empty mutually exclusive and ignores a late list response after logout', async () => {
  const services = createCoreServices(activeBrand);
  services.analytics.identify = jest.fn();
  services.analytics.reset = jest.fn();
  services.i18n.add('zh-CN', seckillTranslations['zh-CN']);
  services.i18n.setLocale('zh-CN');
  jest.mocked(useApplication).mockReturnValue({
    brand: activeBrand,
    services,
    locale: 'zh-CN',
  } as ReturnType<typeof useApplication>);
  await services.session.setSession({
    userId: 'a',
    accessToken: 'token',
    expiresAt: Date.now() + 60000,
    permissions: [],
  });
  const pending = deferred<(typeof activity)[]>();
  const repository: SeckillPort = {
    list: jest.fn().mockReturnValue(pending.promise),
    get: jest.fn(),
    token: jest.fn(),
    request: jest.fn(),
  };
  const store = new SeckillStore(repository, services.session);
  const { SeckillListScreen } = createSeckillScreens(repository, store);
  let renderer!: Renderer.ReactTestRenderer;
  await act(async () => {
    renderer = Renderer.create(
      <AppNavigationProvider navigate={jest.fn()} params={{}}>
        <SeckillListScreen />
      </AppNavigationProvider>,
    );
  });
  expect(JSON.stringify(renderer.toJSON())).toContain('正在读取活动');
  expect(JSON.stringify(renderer.toJSON())).not.toContain('暂无可参与');
  await act(async () => services.session.signOut());
  await act(async () => pending.resolve([activity]));
  expect(JSON.stringify(renderer.toJSON())).toContain('登录后查看活动');
  expect(JSON.stringify(renderer.toJSON())).not.toContain(activity.name);
  await act(async () => renderer.unmount());
  store.dispose();
});
