import React from 'react';
import { TextInput } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import aurora from '../brands/aurora/brand.config.json';
import cedar from '../brands/cedar/brand.config.json';
import { useApplication } from '../src/app/ApplicationProvider';
import { AppNavigationProvider } from '../src/app/navigation';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { createCoreServices } from '../src/core/services';
import { ApiError } from '../src/core/http';
import { OrdersRepository } from '../src/modules/commerce/orders/repository';
import { createOrdersScreens } from '../src/modules/commerce/orders/screens';
import { ordersTranslations } from '../src/modules/commerce/orders/translations';
import orderFixture from './ordersFixture.json';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

async function setup(
  configuration: { theme: typeof aurora.theme } = aurora,
  locale = 'zh-CN',
) {
  const brand = { ...activeBrand, theme: configuration.theme };
  const services = createCoreServices(brand);
  for (const [language, messages] of Object.entries(ordersTranslations)) {
    services.i18n.add(language, messages);
  }
  services.i18n.setLocale(locale);
  await services.session.setSession({
    userId: 'user-a',
    accessToken: 'test',
    permissions: [],
    expiresAt: Date.now() + 60000,
  });
  jest
    .mocked(useApplication)
    .mockReturnValue({ brand, services, locale } as ReturnType<
      typeof useApplication
    >);
  const request = jest.fn().mockResolvedValue({ data: orderFixture });
  const repository = new OrdersRepository({ request }, services.session);
  const screens = createOrdersScreens(repository, services.session);
  const navigate = jest.fn();
  const t = (key: string) => services.i18n.t(`commerce.orders.${key}`);
  return { services, request, repository, screens, navigate, t };
}
function button(renderer: Renderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAll(node => typeof node.props.onPress === 'function')
    .find(node => node.props.accessibilityLabel === label)!;
}
describe.each([aurora, cedar])('order screens theme %s', configuration => {
  it.each(['zh-CN', 'en-US'])(
    'confirms cancellation, rereads payment race and navigates only by ID in %s',
    async locale => {
      const { screens, request, repository, navigate, t } = await setup(
        configuration,
        locale,
      );
      let renderer!: Renderer.ReactTestRenderer;
      await act(async () => {
        renderer = Renderer.create(
          <AppNavigationProvider
            navigate={navigate}
            params={{ orderId: 'order/1' }}
          >
            <screens.OrderDetailScreen />
          </AppNavigationProvider>,
        );
      });

      act(() => button(renderer, t('payment')).props.onPress());
      expect(navigate).toHaveBeenLastCalledWith('CommercePayment', {
        orderId: 'order/1',
      });
      act(() => button(renderer, t('cancel')).props.onPress());
      expect(request).toHaveBeenCalledTimes(1);
      act(() => button(renderer, t('back')).props.onPress());
      expect(request).toHaveBeenCalledTimes(1);
      act(() => button(renderer, t('cancel')).props.onPress());
      request
        .mockRejectedValueOnce(new ApiError('paid', 409, 'ORDER_ALREADY_PAID'))
        .mockResolvedValueOnce({
          data: { ...orderFixture, status: 'PAID', paymentStatus: 'SUCCESS' },
        });
      await act(async () => {
        button(renderer, t('confirm')).props.onPress();
      });
      expect(request).toHaveBeenCalledTimes(3);
      expect(button(renderer, t('cancel'))).toBeUndefined();
      act(() =>
        button(renderer, `${t('afterSale')} · productName`).props.onPress(),
      );
      expect(navigate).toHaveBeenLastCalledWith('CommerceAfterSale', {
        orderId: 'order/1',
        orderItemId: 'id',
        quantity: '1',
      });
      expect(JSON.stringify(renderer.toJSON())).toContain(t('actionError'));
      act(() => renderer.unmount());
      repository.dispose();
    },
  );
});
it('filters list, retries failures, and ignores stale pages after a filter change', async () => {
  const { screens, request, repository, navigate, t } = await setup();
  request.mockResolvedValue({
    data: { items: [orderFixture], page: 1, pageSize: 20, total: 40 },
  });
  let renderer!: Renderer.ReactTestRenderer;
  await act(async () => {
    renderer = Renderer.create(
      <AppNavigationProvider navigate={navigate} params={{}}>
        <screens.OrdersScreen />
      </AppNavigationProvider>,
    );
  });
  let resolve!: (value: unknown) => void;
  request.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  act(() => {
    button(renderer, t('more')).props.onPress();
    button(renderer, t('more')).props.onPress();
  });
  expect(request).toHaveBeenCalledTimes(2);
  request.mockResolvedValueOnce({
    data: { items: [], page: 1, pageSize: 20, total: 0 },
  });
  await act(async () => button(renderer, t('status.PAID')).props.onPress());
  await act(async () =>
    resolve({
      data: {
        items: [{ ...orderFixture, orderNo: 'stale' }],
        page: 2,
        pageSize: 20,
        total: 40,
      },
    }),
  );
  expect(JSON.stringify(renderer.toJSON())).not.toContain('stale');
  act(() => renderer.root.findByType(TextInput).props.onChangeText('needle'));
  request.mockRejectedValueOnce(new Error('offline'));
  await act(async () => button(renderer, t('search')).props.onPress());
  expect(request.mock.lastCall[0]).toContain('orderNo=needle');
  expect(JSON.stringify(renderer.toJSON())).toContain(t('loadError'));
  request.mockResolvedValueOnce({
    data: { items: [], page: 1, pageSize: 20, total: 0 },
  });
  await act(async () => button(renderer, t('refresh')).props.onPress());
  expect(JSON.stringify(renderer.toJSON())).toContain(t('empty'));
  act(() => renderer.unmount());
  repository.dispose();
});
it('blocks duplicate receipt and late response after leaving, preserving unknown outcome on return', async () => {
  const { screens, request, repository, navigate, t } = await setup();
  request.mockResolvedValue({ data: { ...orderFixture, status: 'SHIPPED' } });
  let renderer!: Renderer.ReactTestRenderer;
  const view = (
    <AppNavigationProvider navigate={navigate} params={{ orderId: 'order/1' }}>
      <screens.OrderDetailScreen />
    </AppNavigationProvider>
  );
  await act(async () => {
    renderer = Renderer.create(view);
  });
  act(() => button(renderer, t('receipt')).props.onPress());
  let reject!: (reason: Error) => void;
  request.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  act(() => {
    const confirm = button(renderer, t('confirm'));
    confirm.props.onPress();
    confirm.props.onPress();
  });
  expect(request).toHaveBeenCalledTimes(2);
  act(() => renderer.unmount());
  await act(async () => reject(new Error('timeout')));
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => {
    renderer = Renderer.create(view);
  });
  expect(button(renderer, t('receipt')).props.disabled).toBe(true);
  expect(JSON.stringify(renderer.toJSON())).toContain(t('unknownResult'));
  act(() => renderer.unmount());
  repository.dispose();
});
it('clears personal data on logout and discards an old account response', async () => {
  const { screens, request, repository, navigate, services } = await setup();
  let resolve!: (value: unknown) => void;
  request.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  let renderer!: Renderer.ReactTestRenderer;
  await act(async () => {
    renderer = Renderer.create(
      <AppNavigationProvider
        navigate={navigate}
        params={{ orderId: 'order/1' }}
      >
        <screens.OrderDetailScreen />
      </AppNavigationProvider>,
    );
  });
  await act(async () => services.session.signOut());
  await act(async () => resolve({ data: orderFixture }));
  expect(JSON.stringify(renderer.toJSON())).not.toContain('productName');
  act(() => renderer.unmount());
  repository.dispose();
});
