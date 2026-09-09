import React from 'react';
import { TextInput, StyleSheet } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { AppNavigationProvider } from '../src/app/navigation';
import { PhoneLoginScreen } from '../src/modules/auth/sms/PhoneLoginScreen';
import {
  deferred,
  response,
  setupApplication,
} from '../src/modules/auth/sms/testing/fixtures';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

describe('SMS screen accessibility and interaction', () => {
  let renderer: Renderer.ReactTestRenderer;
  let services: ReturnType<typeof setupApplication>;
  const navigate = jest.fn();
  const button = (testID: string) =>
    renderer.root.findByProps({ testID, accessibilityRole: 'button' });
  async function mount(locale = 'zh-CN') {
    services = setupApplication();
    services.i18n.setLocale(locale);
    await act(async () => {
      renderer = Renderer.create(
        <AppNavigationProvider navigate={navigate} params={{}}>
          <PhoneLoginScreen />
        </AppNavigationProvider>,
      );
    });
  }
  afterEach(async () => {
    await act(async () => renderer.unmount());
    jest.restoreAllMocks();
    navigate.mockReset();
  });

  it.each(['zh-CN', 'en-US'])(
    'labels fields and provides visible focus in %s',
    async locale => {
      await mount(locale);
      const inputs = renderer.root.findAllByType(TextInput);
      expect(inputs[0].props.accessibilityLabel).toBe(
        services.i18n.t('auth.login.phone.label'),
      );
      expect(inputs[1].props.accessibilityLabel).toBe(
        services.i18n.t('auth.login.code.label'),
      );
      expect(inputs[1].props.maxLength).toBe(6);
      expect(
        button('phone-login-submit').props.accessibilityState.disabled,
      ).toBe(true);
      const before = StyleSheet.flatten(inputs[0].props.style).borderColor;
      act(() => inputs[0].props.onFocus({}));
      expect(
        StyleSheet.flatten(
          renderer.root.findAllByType(TextInput)[0].props.style,
        ).borderColor,
      ).not.toBe(before);
    },
  );

  it('exposes loading and failure, prevents repeated send and keeps phone editable to replace intent', async () => {
    const pending = deferred<Response>();
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockReturnValue(pending.promise);
    await mount();
    act(() =>
      renderer.root
        .findAllByType(TextInput)[0]
        .props.onChangeText('+123456789'),
    );
    let completion!: Promise<void>;
    act(() => {
      completion = button('phone-login-send-code').props.onPress();
    });
    expect(button('phone-login-send-code').props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    expect(renderer.root.findAllByType(TextInput)[1].props.editable).toBe(
      false,
    );
    expect(renderer.root.findAllByType(TextInput)[0].props.editable).not.toBe(
      false,
    );
    await act(async () => {
      pending.resolve(response({ code: 'SMS_UNAVAILABLE' }, 503));
      await completion;
    });
    expect(
      renderer.root.findByProps({ testID: 'phone-login-error' }).props.children,
    ).toBe(services.i18n.t('auth.login.phone.error.unavailable'));
    expect(
      renderer.root.findAllByProps({ testID: 'phone-login-timing' }),
    ).toHaveLength(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    act(() => button('phone-login-account-link').props.onPress());
    expect(navigate).toHaveBeenCalledWith('AccountPasswordLogin');
  });
});
