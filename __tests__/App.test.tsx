/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({children}: React.PropsWithChildren) => children,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

test('shows QR login on the configured login page instead of home', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const visible = (testID: string): void => {
    expect(renderer!.root.findAllByProps({testID})).not.toHaveLength(0);
  };
  const press = (testID: string): void => {
    const target = renderer!.root
      .findAllByProps({testID})
      .find(item => typeof item.props.onPress === 'function');
    expect(target).toBeDefined();
    target!.props.onPress();
  };

  expect(
    renderer!.root.findAllByProps({ testID: 'login-option-login.qrLogin' }),
  ).toHaveLength(0);
  const loginTab = renderer!.root.findByProps({
    accessibilityLabel: '登录',
    accessibilityRole: 'tab',
  });
  await ReactTestRenderer.act(() => {
    loginTab.props.onPress();
  });

  visible('login-option-login.accountPassword');
  visible('login-option-login.phone');
  visible('login-option-login.qrLogin');

  await ReactTestRenderer.act(() => {
    press('login-option-login.accountPassword');
  });
  visible('account-login-account');
  visible('account-login-password');
  visible('account-login-forgot');

  await ReactTestRenderer.act(() => {
    press('account-login-forgot');
  });
  visible('forgot-password-account');

  const loginTabAgain = renderer!.root.findByProps({
    accessibilityLabel: '登录',
    accessibilityRole: 'tab',
  });
  await ReactTestRenderer.act(() => {
    loginTabAgain.props.onPress();
  });
  await ReactTestRenderer.act(() => {
    press('login-option-login.phone');
  });
  visible('phone-login-phone');
  visible('phone-login-code');
  visible('phone-login-send-code');
});
