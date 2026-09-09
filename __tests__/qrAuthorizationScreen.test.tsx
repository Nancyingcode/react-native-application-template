import React from 'react';
import { AppState, Linking, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import {
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { useApplication } from '../src/app/ApplicationProvider';
import { AppNavigationProvider } from '../src/app/navigation';
import type { BrandConfig } from '../src/brand/types';
import aurora from '../brands/aurora/brand.config.json';
import cedar from '../brands/cedar/brand.config.json';
import { I18n } from '../src/core/i18n';
import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import type { CoreServices } from '../src/core/services';
import { QrLoginScreen } from '../src/modules/auth/QrLoginScreen';
import { qrLoginPlugin } from '../src/plugins/qr-login';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));
jest.mock('react-native-vision-camera', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  return {
    Camera: (props: object) =>
      ReactMock.createElement(View, { testID: 'camera', ...props }),
    useCameraDevice: jest.fn(),
    useCameraPermission: jest.fn(),
  };
});

const sessionId = '019934ba-7437-7000-8000-000000000001';
const raw = JSON.stringify({
  type: 'qr-login',
  sessionId,
  scanToken: 'a'.repeat(64),
});

describe('T2 screen and camera regression', () => {
  let renderer: TestRenderer.ReactTestRenderer;
  let request: jest.Mock;
  let navigate: jest.Mock;
  let requestPermission: jest.Mock;
  let i18n: I18n;
  let emitAppState: (state: import('react-native').AppStateStatus) => void;
  let expiry: string;
  async function mount(brand = aurora as BrandConfig, locale = 'zh-CN') {
    const session = new SessionManager(new InMemorySessionStore());
    await session.setSession({
      userId: 'mobile',
      accessToken: 'phone-token',
      expiresAt: Date.now() + 3600000,
      permissions: [],
    });
    i18n = new I18n('zh-CN');
    const services = {
      session,
      i18n,
      http: { request },
    } as unknown as CoreServices;
    const plugin = qrLoginPlugin.create({ brand, services });
    for (const [language, messages] of Object.entries(plugin.translations!))
      i18n.add(language, messages);
    i18n.setLocale(locale);
    jest
      .mocked(useApplication)
      .mockReturnValue({ brand, services } as ReturnType<
        typeof useApplication
      >);
    await act(async () => {
      renderer = TestRenderer.create(
        <AppNavigationProvider navigate={navigate} params={{}}>
          <QrLoginScreen />
        </AppNavigationProvider>,
      );
    });
  }
  function text() {
    return renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .join(' ');
  }
  function button(key: string) {
    return renderer.root
      .findAll(node => node.props.accessibilityRole === 'button')
      .find(node =>
        node
          .findAllByType(Text)
          .some(child => child.props.children === i18n.t(key)),
      )!;
  }
  function scan(values = [raw]) {
    const camera = renderer.root.findByProps({ testID: 'camera' });
    return camera.props.outputs[0].options.onBarcodeScanned(
      values.map(rawValue => ({ rawValue })),
    );
  }
  beforeEach(() => {
    jest.useFakeTimers();
    expiry = new Date(Date.now() + 120000).toISOString();
    request = jest.fn().mockResolvedValue({
      data: { sessionId, status: 'SCANNED', expiresAt: expiry },
    });
    navigate = jest.fn();
    requestPermission = jest.fn().mockResolvedValue(false);
    jest
      .mocked(useCameraDevice)
      .mockReturnValue({ hasTorch: true } as ReturnType<
        typeof useCameraDevice
      >);
    jest.mocked(useCameraPermission).mockReturnValue({
      hasPermission: true,
      canRequestPermission: false,
      status: 'authorized',
      requestPermission,
    });
    AppState.currentState = 'active';
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        emitAppState = listener;
        return { remove: jest.fn() };
      });
  });
  afterEach(async () => {
    if (renderer) await act(async () => renderer.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it.each([
    ['aurora', 'zh-CN'],
    ['aurora', 'en-US'],
    ['cedar', 'zh-CN'],
    ['cedar', 'en-US'],
  ])('renders neutral review for %s %s', async (brand, locale) => {
    await mount((brand === 'aurora' ? aurora : cedar) as BrandConfig, locale);
    await act(async () => scan());
    expect(text()).toContain(i18n.t('auth.qr.review.title'));
    expect(text()).not.toMatch(/Chrome|Hong Kong|Windows|auth\.qr\./);
    expect(renderer.root.findAllByProps({ testID: 'camera' })).toHaveLength(0);
    expect(button('auth.qr.review.confirm').props.disabled).toBe(false);
  });
  it('pauses repeated recognition and disables both actions while pending', async () => {
    await mount();
    await act(async () => {
      scan();
      scan();
    });
    expect(request).toHaveBeenCalledTimes(1);
    let resolve!: (value: unknown) => void;
    request.mockReturnValue(
      new Promise(yes => {
        resolve = yes;
      }),
    );
    await act(async () => {
      button('auth.qr.review.confirm').props.onPress();
    });
    expect(button('auth.qr.review.submitting').props.disabled).toBe(true);
    expect(button('auth.qr.review.cancel').props.disabled).toBe(true);
    await act(async () =>
      resolve({ data: { sessionId, status: 'CONFIRMED', expiresAt: expiry } }),
    );
    expect(text()).toContain(i18n.t('auth.qr.success.description'));
  });
  it('shows cancellation then accepts only a new code', async () => {
    await mount();
    await act(async () => scan());
    request.mockResolvedValue({
      data: { sessionId, status: 'CANCELLED', expiresAt: expiry },
    });
    await act(async () => button('auth.qr.review.cancel').props.onPress());
    expect(text()).toContain(i18n.t('auth.qr.cancelled.title'));
    await act(async () => button('auth.qr.rescan').props.onPress());
    expect(renderer.root.findByProps({ testID: 'camera' }).props.isActive).toBe(
      true,
    );
    await act(async () => scan());
    expect(text()).toContain(i18n.t('auth.qr.error.used'));
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not auto-cancel on return and ignores the late response', async () => {
    let resolve!: (value: unknown) => void;
    request.mockReturnValue(
      new Promise(yes => {
        resolve = yes;
      }),
    );
    await mount();
    await act(async () => scan());
    await act(async () =>
      renderer.root.findByProps({ testID: 'qr-back' }).props.onPress(),
    );
    await act(async () =>
      resolve({ data: { sessionId, status: 'SCANNED', expiresAt: expiry } }),
    );
    expect(navigate).toHaveBeenCalledWith('Home');
    expect(request).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain(i18n.t('auth.qr.review.title'));
  });
  it('stops camera in background and recomputes expiry on foreground', async () => {
    await mount();
    await act(async () => emitAppState('background'));
    expect(renderer.root.findByProps({ testID: 'camera' }).props.isActive).toBe(
      false,
    );
    await act(async () => emitAppState('active'));
    await act(async () => scan());
    await act(async () => emitAppState('background'));
    jest.setSystemTime(Date.parse(expiry) + 1);
    await act(async () => emitAppState('active'));
    expect(text()).toContain(i18n.t('auth.qr.error.expired'));
  });
  it('rejects multiple codes without submitting', async () => {
    await mount();
    await act(async () => scan([raw, raw]));
    expect(text()).toContain(i18n.t('auth.qr.error.multiple'));
    expect(request).not.toHaveBeenCalled();
  });
  it('keeps denied permission separate from authorization and opens settings', async () => {
    jest.mocked(useCameraPermission).mockReturnValue({
      hasPermission: false,
      canRequestPermission: false,
      status: 'denied',
      requestPermission,
    });
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    await mount();
    expect(renderer.root.findAllByProps({ testID: 'camera' })).toHaveLength(0);
    await act(async () =>
      button('auth.qr.permission.settings').props.onPress(),
    );
    expect(settings).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });
  it('requests camera permission without bypassing a rejection', async () => {
    jest.mocked(useCameraPermission).mockReturnValue({
      hasPermission: false,
      canRequestPermission: true,
      status: 'not-determined',
      requestPermission,
    });
    await mount();
    await act(async () => button('auth.qr.permission.allow').props.onPress());
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ testID: 'camera' })).toHaveLength(0);
  });
  it('shows unavailable camera and sanitized camera errors', async () => {
    jest.mocked(useCameraDevice).mockReturnValue(undefined);
    await mount();
    expect(text()).toContain(i18n.t('auth.qr.cameraUnavailable.title'));
  });
  it('preserves requiresAuth registration', async () => {
    const plugin = qrLoginPlugin.create({
      brand: aurora as BrandConfig,
      services: {} as CoreServices,
    });
    expect(plugin.routes[0].requiresAuth).toBe(true);
  });
});
