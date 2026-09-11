/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: React.PropsWithChildren) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

test('opens profile and preserves QR authorization after authenticating', async () => {
  let finishLogout: (response: Response) => void = () => {};
  const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async url => {
    if (String(url).endsWith('/api/v1/auth/logout')) {
      return new Promise<Response>(resolve => {
        finishLogout = resolve;
      });
    }
    if (String(url).endsWith('/api/v1/auth/login')) {
      return new Response(
        JSON.stringify({
          data: {
            user: { id: 'user-1' },
            tokens: {
              accessToken: 'access-1',
              refreshToken: 'refresh-1',
              tokenType: 'Bearer',
              accessExpiresInSeconds: 900,
              refreshExpiresInSeconds: 2592000,
            },
          },
        }),
        { status: 200 },
      );
    }
    if (String(url).endsWith('/api/v1/users/me')) {
      return new Response(
        JSON.stringify({
          data: {
            id: 'user-1',
            email: 'user@example.com',
            phone: null,
            displayName: 'Profile Customer',
            status: 'ACTIVE',
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-08T00:00:00.000Z',
          },
        }),
        { status: 200 },
      );
    }
    return new Response(null, { status: 204 });
  });
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const visible = (testID: string): void => {
    expect(renderer!.root.findAllByProps({ testID })).not.toHaveLength(0);
  };
  const press = (testID: string): void => {
    const target = renderer!.root
      .findAllByProps({ testID })
      .find(item => typeof item.props.onPress === 'function');
    expect(target).toBeDefined();
    target!.props.onPress();
  };

  expect(
    renderer!.root.findAllByProps({ testID: 'login-option-login.qrLogin' }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({ accessibilityLabel: '个人资料' }),
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
  expect(
    renderer!.root.findAllByProps({ testID: 'login-option-login.qrLogin' }),
  ).toHaveLength(0);

  await ReactTestRenderer.act(() => {
    press('login-option-login.accountPassword');
  });
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ testID: 'account-login-account' })
      .props.onChangeText('user@example.com');
    renderer!.root
      .findByProps({ testID: 'account-login-password' })
      .props.onChangeText('example-password');
  });
  await ReactTestRenderer.act(async () => {
    await renderer!.root
      .findByProps({ testID: 'account-login-submit' })
      .props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    const profileEntry = renderer!.root
      .findAllByProps({
        accessibilityLabel: '个人资料',
        accessibilityRole: 'button',
      })
      .find(item => typeof item.props.onPress === 'function');
    expect(profileEntry).toBeDefined();
    profileEntry!.props.onPress();
  });
  expect(
    renderer!.root.findAllByProps({ children: 'Profile Customer' }),
  ).not.toHaveLength(0);
  expect(
    fetcher.mock.calls.some(
      ([url, options]) =>
        String(url).endsWith('/api/v1/users/me') &&
        new Headers(options?.headers).get('Authorization') ===
          'Bearer access-1',
    ),
  ).toBe(true);
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({ accessibilityLabel: '登录', accessibilityRole: 'tab' })
      .props.onPress();
  });
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
  await ReactTestRenderer.act(() => {
    renderer!.root
      .findByProps({
        accessibilityLabel: '首页',
        accessibilityRole: 'tab',
      })
      .props.onPress();
  });
  await ReactTestRenderer.act(async () => {
    renderer!.root
      .findAllByProps({
        accessibilityLabel: '个人资料',
        accessibilityRole: 'button',
      })
      .find(item => typeof item.props.onPress === 'function')!
      .props.onPress();
  });
  await ReactTestRenderer.act(() => press('logout-button'));
  await ReactTestRenderer.act(() => press('logout-cancel'));
  expect(
    fetcher.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/v1/auth/logout'),
    ),
  ).toHaveLength(0);
  await ReactTestRenderer.act(() => press('logout-button'));
  await ReactTestRenderer.act(async () => press('logout-confirm'));
  expect(
    renderer!.root.findAllByProps({ children: 'Profile Customer' }),
  ).toHaveLength(0);
  visible('logout-button');
  await ReactTestRenderer.act(async () =>
    finishLogout(new Response(null, { status: 503 })),
  );
  expect(
    renderer!.root.findByProps({ testID: 'logout-result' }).props.children,
  ).toContain('远端会话撤销尚未确认');
  const logoutCalls = fetcher.mock.calls.filter(([url]) =>
    String(url).endsWith('/api/v1/auth/logout'),
  );
  expect(logoutCalls).toHaveLength(1);
  expect(JSON.parse(String(logoutCalls[0][1]?.body))).toEqual({
    refreshToken: 'refresh-1',
  });
  await ReactTestRenderer.act(() => renderer!.unmount());
  fetcher.mockRestore();
});

test('switches all visible copy without resetting navigation', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const pressByTestId = (testID: string): void => {
    const target = renderer!.root
      .findAllByProps({ testID })
      .find(item => typeof item.props.onPress === 'function');
    expect(target).toBeDefined();
    target!.props.onPress();
  };

  const loginTab = renderer!.root.findByProps({
    accessibilityLabel: '登录',
    accessibilityRole: 'tab',
  });
  await ReactTestRenderer.act(() => {
    loginTab.props.onPress();
  });
  expect(
    renderer!.root.findAllByProps({ accessibilityLabel: '账号密码登录' }),
  ).not.toHaveLength(0);

  await ReactTestRenderer.act(() => {
    pressByTestId('locale-switcher');
  });

  expect(
    renderer!.root.findAllByProps({
      accessibilityLabel: 'Sign in with password',
    }),
  ).not.toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({
      accessibilityLabel: 'Sign in',
      accessibilityRole: 'tab',
    }),
  ).not.toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({ accessibilityLabel: 'Home' }),
  ).not.toHaveLength(0);
});
