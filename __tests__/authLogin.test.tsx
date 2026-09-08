import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useApplication } from '../src/app/ApplicationProvider';
import { AppNavigationProvider } from '../src/app/navigation';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { ConsoleLogger } from '../src/core/logger';
import { createCoreServices, type CoreServices } from '../src/core/services';
import { AccountPasswordLoginScreen } from '../src/modules/auth/AuthMethodScreens';
import { authModule } from '../src/modules/auth';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

const loginData = {
  user: { id: '019934ba-7437-7000-8000-000000000001' },
  tokens: {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    tokenType: 'Bearer',
    accessExpiresInSeconds: 900,
    refreshExpiresInSeconds: 2592000,
  },
};

function successResponse(): Response {
  return new Response(JSON.stringify({ code: 'SUCCESS', data: loginData }), {
    status: 200,
  });
}

function deferredResponse() {
  let resolve = (_response: Response): void => {
    throw new Error('Response promise is not initialized');
  };
  const promise = new Promise<Response>(complete => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('account password sign in', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  let services: CoreServices;
  const navigate = jest.fn();

  function submit(): Promise<void> {
    return renderer.root
      .findByProps({ testID: 'account-login-submit' })
      .props.onPress();
  }

  async function enterCredentials(
    email = 'customer@example.com',
    password = 'password-with-spaces ',
  ) {
    await act(async () => {
      const inputs = renderer.root.findAllByType(TextInput);
      inputs[0].props.onChangeText(email);
      inputs[1].props.onChangeText(password);
    });
  }

  function hasText(text: string): boolean {
    return renderer.root
      .findAllByType(Text)
      .some(item => item.props.children === text);
  }

  async function renderScreen() {
    services = createCoreServices(activeBrand);
    jest.spyOn(services.analytics, 'track').mockImplementation(() => undefined);
    jest
      .spyOn(services.analytics, 'identify')
      .mockImplementation(() => undefined);
    const module = authModule.create({ brand: activeBrand, services });
    for (const [locale, messages] of Object.entries(
      module.translations ?? {},
    )) {
      services.i18n.add(locale, messages);
    }
    jest.mocked(useApplication).mockReturnValue({
      brand: activeBrand,
      services,
      locale: activeBrand.defaultLocale,
      environment: 'development',
      modules: [module],
      application: {
        routes: module.routes,
        menu: [],
        home: [],
        login: [],
        initialRoute: 'Home',
      },
      setLocale: jest.fn(),
      setServerFlags: jest.fn(),
    });
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AppNavigationProvider navigate={navigate} params={{}}>
          <AccountPasswordLoginScreen />
        </AppNavigationProvider>,
      );
    });
  }

  beforeEach(() => {
    navigate.mockReset();
    jest
      .spyOn(ConsoleLogger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer.unmount());
    }
    jest.restoreAllMocks();
  });

  it('signs in with email, stores API tokens and navigates home', async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(successResponse());
    await renderScreen();
    await enterCredentials(' customer@example.com ');
    await act(async () => submit());

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      `${activeBrand.environments.development.apiBaseUrl}/api/v1/auth/login`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'customer@example.com',
          password: 'password-with-spaces ',
        }),
        authenticated: false,
        retry: 0,
      }),
    );
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).has('Authorization'),
    ).toBe(false);
    expect(await services.session.getSession()).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      userId: loginData.user.id,
      permissions: [],
      expiresAt: now + 900_000,
      refreshExpiresAt: now + 2_592_000_000,
    });
    expect(services.analytics.track).toHaveBeenCalledWith(
      'account_password_login_submitted',
    );
    expect(navigate).toHaveBeenCalledWith('Home');
  });

  it('disables the form while submitting and ignores repeated submissions', async () => {
    const pending = deferredResponse();
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockReturnValue(pending.promise);
    await renderScreen();
    await enterCredentials();
    let completion: Promise<void> | undefined;
    act(() => {
      completion = submit();
      submit();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findByProps({
        testID: 'account-login-submit',
        accessibilityRole: 'button',
      }).props,
    ).toMatchObject({
      disabled: true,
      accessibilityState: { disabled: true, busy: true },
    });
    expect(hasText('登录中…')).toBe(true);
    expect(
      renderer.root
        .findAllByType(TextInput)
        .every(input => input.props.editable === false),
    ).toBe(true);
    await act(async () => {
      pending.resolve(successResponse());
      await completion;
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid email without contacting the server', async () => {
    const fetcher = jest.spyOn(global, 'fetch');
    await renderScreen();
    await enterCredentials('not-an-email');
    await act(async () => submit());

    expect(fetcher).not.toHaveBeenCalled();
    expect(hasText('请输入有效的邮箱地址。')).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows invalid credentials without logging the password and permits retry', async () => {
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid credentials',
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(successResponse());
    await renderScreen();
    await enterCredentials();
    await act(async () => submit());

    expect(hasText('邮箱或密码不正确，请重试。')).toBe(true);
    expect(await services.session.getSession()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(
      JSON.stringify(jest.mocked(ConsoleLogger.prototype.log).mock.calls),
    ).not.toContain('password-with-spaces');
    await act(async () => submit());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith('Home');
  });

  it('does not create a session when the login response is malformed', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'SUCCESS',
          data: { user: { id: 'user-1' }, tokens: {} },
        }),
        { status: 200 },
      ),
    );
    await renderScreen();
    await enterCredentials();
    await act(async () => submit());

    expect(await services.session.getSession()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(hasText('登录失败，请检查网络后重试。')).toBe(true);
  });

  it('ignores login responses that arrive after leaving the page', async () => {
    const pending = deferredResponse();
    jest.spyOn(global, 'fetch').mockReturnValue(pending.promise);
    await renderScreen();
    await enterCredentials();
    let completion: Promise<void> | undefined;
    act(() => {
      completion = submit();
    });
    await act(async () => renderer.unmount());
    await act(async () => {
      pending.resolve(successResponse());
      await completion;
    });

    expect(await services.session.getSession()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
