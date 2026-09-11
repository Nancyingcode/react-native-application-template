import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import aurora from '../brands/aurora/brand.config.json';
import cedar from '../brands/cedar/brand.config.json';
import { useApplication } from '../src/app/ApplicationProvider';
import { AppNavigationProvider } from '../src/app/navigation';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { createCoreServices } from '../src/core/services';
import { PaymentController } from '../src/modules/commerce/payments/PaymentController';
import {
  createPaymentScreen,
  statusKey,
} from '../src/modules/commerce/payments/screen';
import { paymentsTranslations } from '../src/modules/commerce/payments/translations';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

describe.each([aurora, cedar])('payment theme %s', configuration => {
  it.each(['zh-CN', 'en-US'])(
    'supports selection, queries and navigation in %s without mock or SDK launch',
    async locale => {
      const brand = { ...activeBrand, theme: configuration.theme };
      const services = createCoreServices(brand);
      Object.entries(paymentsTranslations).forEach(([language, messages]) =>
        services.i18n.add(language, messages),
      );
      services.i18n.setLocale(locale);
      jest
        .mocked(useApplication)
        .mockReturnValue({ brand, services, locale } as ReturnType<
          typeof useApplication
        >);
      await services.session.setSession({
        userId: 'A',
        accessToken: 'test',
        expiresAt: Date.now() + 60000,
        permissions: [],
      });
      const payment = {
        paymentId: 'payment-1',
        orderId: 'order-1',
        amount: '199.0000',
        currency: 'CNY',
        status: 'PENDING',
      };
      const port = {
        create: jest.fn().mockResolvedValue(payment),
        get: jest.fn().mockResolvedValue({ ...payment, status: 'SUCCESS' }),
      };
      const controller = new PaymentController(port, services.session);
      const Screen = createPaymentScreen(controller);
      const navigate = jest.fn();
      const remove = jest.fn();
      let appStateChange!: (state: AppStateStatus) => void;
      const subscription = jest
        .spyOn(AppState, 'addEventListener')
        .mockImplementation((_event, callback) => {
          appStateChange = callback;
          return { remove };
        });
      let renderer!: Renderer.ReactTestRenderer;
      await act(async () => {
        renderer = Renderer.create(
          <AppNavigationProvider
            navigate={navigate}
            params={{ orderId: 'order-1' }}
          >
            <Screen />
          </AppNavigationProvider>,
        );
      });
      const t = (key: string) => services.i18n.t(`commerce.payment.v2.${key}`);
      const press = (label: string) =>
        renderer.root
          .findAllByProps({ accessibilityLabel: label })
          .find(node => typeof node.props.onPress === 'function')!
          .props.onPress();
      expect(port.create).not.toHaveBeenCalled();
      await act(async () => {
        press(t('ALIPAY'));
      });
      await act(async () => {
        press(t('create'));
      });
      expect(port.create).toHaveBeenCalledWith(
        { orderId: 'order-1', provider: 'ALIPAY' },
        expect.objectContaining({ idempotencyKey: expect.any(String) }),
      );
      expect(JSON.stringify(renderer.toJSON())).toContain(t('pending'));
      expect(JSON.stringify(renderer.toJSON())).not.toContain('199.0000');
      await act(async () => {
        appStateChange('background');
        appStateChange('active');
      });
      expect(port.get).toHaveBeenCalledWith('payment-1');
      expect(JSON.stringify(renderer.toJSON())).toContain(t('success'));
      await act(async () => {
        appStateChange('active');
      });
      expect(port.get).toHaveBeenCalledTimes(1);
      await act(async () => {
        press(t('check'));
      });
      expect(port.get).toHaveBeenCalledTimes(2);
      await act(async () => {
        press(t('orders'));
      });
      expect(navigate).toHaveBeenCalledWith('CommerceOrders');
      expect(JSON.stringify(renderer.toJSON())).not.toMatch(
        /mockSuccess|MOCK|redirectUrl/,
      );
      await act(async () => {
        renderer.unmount();
      });
      expect(remove).toHaveBeenCalled();
      controller.dispose();
      subscription.mockRestore();
    },
  );
});

it.each([
  ['SUCCESS', 'success'],
  ['PENDING', 'pending'],
  ['PROCESSING', 'pending'],
  ['EXPIRED', 'expired'],
  ['FAILED', 'failed'],
  ['succeeded', 'unconfirmed'],
  ['PAID', 'unconfirmed'],
  ['NEW_SERVER_STATUS', 'unconfirmed'],
])(
  'maps payment %s without using the legacy/order state machine',
  (status, expected) => {
    expect(
      statusKey({
        orderId: 'order-1',
        phase: 'ready',
        message: '',
        hasOperation: true,
        payment: {
          paymentId: 'payment-1',
          orderId: 'order-1',
          status,
          amount: '1.0000',
          currency: 'CNY',
        },
      }),
    ).toBe(expected);
  },
);
