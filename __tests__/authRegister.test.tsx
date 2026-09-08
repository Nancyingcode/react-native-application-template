import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useApplication } from '../src/app/ApplicationProvider';
import { AppNavigationProvider } from '../src/app/navigation';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { ConsoleLogger } from '../src/core/logger';
import { createCoreServices, type CoreServices } from '../src/core/services';
import {
  AccountPasswordLoginScreen,
  RegisterScreen,
} from '../src/modules/auth/AuthMethodScreens';
import { LoginScreen } from '../src/modules/auth/LoginScreen';
import { authModule } from '../src/modules/auth';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

const registrationData = {
  user: { id: '019934ba-7437-7000-8000-000000000001' },
  tokens: {
    accessToken: 'registration-access-token',
    refreshToken: 'registration-refresh-token',
    tokenType: 'Bearer',
    accessExpiresInSeconds: 900,
    refreshExpiresInSeconds: 2592000,
  },
};

const validForm = {
  email: 'customer@example.com',
  password: ' Registration-password1 ',
  confirmPassword: ' Registration-password1 ',
  displayName: '',
};

function successResponse(): Response {
  return new Response(
    JSON.stringify({ code: 'SUCCESS', data: registrationData }),
    { status: 201 },
  );
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

describe('email registration', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  let services: CoreServices;
  let fetcher: jest.SpyInstance<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >;
  const navigate = jest.fn();

  function button(testID: string) {
    return renderer.root.findByProps({
      testID,
      accessibilityRole: 'button',
    });
  }

  function submit(): Promise<void> {
    return button('register-submit').props.onPress();
  }

  async function enterForm(overrides: Partial<typeof validForm> = {}) {
    const form = { ...validForm, ...overrides };
    await act(async () => {
      for (const [testID, value] of Object.entries({
        'register-email': form.email,
        'register-password': form.password,
        'register-confirm-password': form.confirmPassword,
        'register-display-name': form.displayName,
      })) {
        renderer.root.findByProps({ testID }).props.onChangeText(value);
      }
    });
  }

  function expectError(key: string): void {
    const translation = services.i18n.t(key);
    expect(translation).not.toBe(key);
    expect(
      renderer.root.findByProps({
        testID: 'register-error',
        accessibilityRole: 'alert',
      }).props.children,
    ).toBe(translation);
  }

  async function renderScreen(Screen = RegisterScreen, locale = 'zh-CN') {
    services = createCoreServices(activeBrand);
    jest.spyOn(services.analytics, 'track').mockImplementation(() => undefined);
    jest
      .spyOn(services.analytics, 'identify')
      .mockImplementation(() => undefined);
    const module = authModule.create({ brand: activeBrand, services });
    for (const [language, messages] of Object.entries(
      module.translations ?? {},
    )) {
      services.i18n.add(language, messages);
    }
    services.i18n.setLocale(locale);
    jest.mocked(useApplication).mockReturnValue({
      brand: activeBrand,
      services,
      locale,
      environment: 'development',
      modules: [module],
      application: {
        routes: module.routes,
        menu: [],
        home: [],
        login: module.login ?? [],
        initialRoute: 'Home',
      },
      setLocale: jest.fn(),
      setServerFlags: jest.fn(),
    });
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <AppNavigationProvider navigate={navigate} params={{}}>
          <Screen />
        </AppNavigationProvider>,
      );
    });
  }

  beforeEach(() => {
    navigate.mockReset();
    jest
      .spyOn(ConsoleLogger.prototype, 'log')
      .mockImplementation(() => undefined);
    fetcher = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('Unexpected request in registration test'));
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer.unmount());
    }
    jest.restoreAllMocks();
  });

  it('registers with normalized profile fields, saves tokens and opens home', async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    fetcher.mockResolvedValue(successResponse());
    await renderScreen();
    await enterForm({
      email: ' customer@example.com ',
      displayName: ' 新用户 ',
    });
    await act(async () => submit());

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      `${activeBrand.environments.development.apiBaseUrl}/api/v1/auth/register`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'customer@example.com',
          password: validForm.password,
          displayName: '新用户',
        }),
        authenticated: false,
        retry: 0,
      }),
    );
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).has('Authorization'),
    ).toBe(false);
    expect(await services.session.getSession()).toEqual({
      accessToken: registrationData.tokens.accessToken,
      refreshToken: registrationData.tokens.refreshToken,
      userId: registrationData.user.id,
      permissions: [],
      expiresAt: now + 900_000,
      refreshExpiresAt: now + 2_592_000_000,
    });
    expect(services.analytics.track).toHaveBeenCalledWith(
      'registration_submitted',
    );
    expect(navigate).toHaveBeenCalledWith('Home');
  });

  it.each(['', '   '])(
    'omits the optional blank nickname %p',
    async displayName => {
      fetcher.mockResolvedValue(successResponse());
      await renderScreen();
      await enterForm({ displayName });
      await act(async () => submit());

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
        email: validForm.email,
        password: validForm.password,
      });
      expect(navigate).toHaveBeenCalledWith('Home');
    },
  );

  it.each(['email', 'password', 'confirmPassword'] as const)(
    'disables registration when the required %s field is empty',
    async field => {
      await renderScreen();
      await enterForm({ [field]: '' });

      expect(button('register-submit').props.disabled).toBe(true);
      await act(async () => submit());
      expect(fetcher).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['invalid email', { email: 'not-an-email' }, 'email'],
    ['long email', { email: `${'a'.repeat(309)}@example.com` }, 'email'],
    [
      'short password',
      { password: 'a'.repeat(11), confirmPassword: 'a'.repeat(11) },
      'password',
    ],
    [
      'long password',
      { password: 'a'.repeat(129), confirmPassword: 'a'.repeat(129) },
      'password',
    ],
    [
      'mismatched confirmation',
      { confirmPassword: validForm.password.trim() },
      'confirmPassword',
    ],
    ['long nickname', { displayName: '名'.repeat(101) }, 'displayName'],
  ] as const)(
    'rejects %s before contacting the server',
    async (_name, form, error) => {
      await renderScreen();
      await enterForm(form);
      await act(async () => submit());

      expect(fetcher).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expectError(`auth.register.error.${error}`);
    },
  );

  it.each([
    ['uppercase letter', 'registration1!'],
    ['lowercase letter', 'REGISTRATION1!'],
    ['number', 'Registration!!'],
    ['symbol', 'Registration12'],
    ['symbol with only an emoji', 'Registration1😀'],
    ['symbol with only Chinese punctuation', 'Registration1。'],
    ['symbol with only a tab', 'Registration1\t'],
    ['ASCII uppercase letter', 'Ｒegistration1!'],
    ['ASCII lowercase letter', 'REGISTRATIONａ1!'],
    ['ASCII number', 'Registration１!'],
  ])('requires a password containing %s', async (_name, password) => {
    await renderScreen();
    await enterForm({ password, confirmPassword: password });
    await act(async () => submit());

    expect(fetcher).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expectError('auth.register.error.passwordStrength');
  });

  it.each([' ', '£', '\\'])(
    'accepts the documented password symbol %p without altering the password',
    async symbol => {
      const password = `Registration1${symbol}`;
      fetcher.mockResolvedValue(successResponse());
      await renderScreen();
      await enterForm({ password, confirmPassword: password });
      await act(async () => submit());

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).password).toBe(
        password,
      );
      expect(navigate).toHaveBeenCalledWith('Home');
    },
  );

  it.each([12, 128])(
    'accepts a %i-character password and maximum-length profile fields',
    async passwordLength => {
      fetcher.mockResolvedValue(successResponse());
      await renderScreen();
      await enterForm({
        email: `${'a'.repeat(308)}@example.com`,
        password: `Aa1!${'a'.repeat(passwordLength - 4)}`,
        confirmPassword: `Aa1!${'a'.repeat(passwordLength - 4)}`,
        displayName: '名'.repeat(100),
      });
      await act(async () => submit());

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith('Home');
    },
  );

  it.each([
    ['8 characters with surrogate pairs', `Aa1!${'😀'.repeat(4)}`],
    ['129 characters with surrogate pairs', `Aa1!${'😀'.repeat(125)}`],
    ['11 characters with emoji selectors', `Aa1!${'❤\uFE0F'.repeat(7)}`],
    ['11 characters with text selectors', `Aa1!${'❤\uFE0E'.repeat(7)}`],
    ['129 characters with emoji selectors', `Aa1!${'😀\uFE0F'.repeat(125)}`],
  ])(
    'rejects a password of %s using API character counting',
    async (_name, password) => {
      await renderScreen();
      await enterForm({ password, confirmPassword: password });
      await act(async () => submit());

      expect(fetcher).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expectError('auth.register.error.password');
    },
  );

  it.each([
    ['12 characters with surrogate pairs', `Aa1!${'😀'.repeat(8)}`],
    ['128 characters with surrogate pairs', `Aa1!${'😀'.repeat(124)}`],
    [
      '12 characters with both presentation selectors',
      `Aa1!${'❤\uFE0F'.repeat(4)}${'❤\uFE0E'.repeat(4)}`,
    ],
    [
      '128 characters with surrogate pairs and presentation selectors',
      `Aa1!${'😀\uFE0F'.repeat(62)}${'❤\uFE0E'.repeat(62)}`,
    ],
  ])('accepts a password of %s without truncation', async (_name, password) => {
    fetcher.mockResolvedValue(successResponse());
    await renderScreen();
    await enterForm({ password, confirmPassword: password });
    await act(async () => submit());

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).password).toBe(
      password,
    );
    expect(navigate).toHaveBeenCalledWith('Home');
  });

  it('accepts a nickname of 100 emoji without truncation', async () => {
    const displayName = '😀'.repeat(100);
    fetcher.mockResolvedValue(successResponse());
    await renderScreen();
    await enterForm({ displayName });
    await act(async () => submit());

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).displayName).toBe(
      displayName,
    );
    expect(navigate).toHaveBeenCalledWith('Home');
  });

  it('rejects a nickname of 101 emoji', async () => {
    await renderScreen();
    await enterForm({ displayName: '😀'.repeat(101) });
    await act(async () => submit());

    expect(fetcher).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expectError('auth.register.error.displayName');
  });

  it('does not impose UTF-16 input limits that truncate valid Unicode fields', async () => {
    await renderScreen();

    expect(
      renderer.root
        .findAllByType(TextInput)
        .every(input => input.props.maxLength === undefined),
    ).toBe(true);
  });

  it('disables all fields during registration and ignores repeated submissions', async () => {
    const pending = deferredResponse();
    fetcher.mockReturnValue(pending.promise);
    await renderScreen();
    await enterForm();
    let completion: Promise<void> | undefined;
    act(() => {
      completion = submit();
      submit();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(button('register-submit').props).toMatchObject({
      disabled: true,
      accessibilityState: { disabled: true, busy: true },
    });
    expect(
      renderer.root
        .findAllByType(Text)
        .some(
          item =>
            item.props.children === services.i18n.t('auth.register.submitting'),
        ),
    ).toBe(true);
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

  it.each([
    [409, 'USER_ALREADY_EXISTS', 'exists'],
    [400, 'VALIDATION_FAILED', 'validation'],
    [429, 'TOO_MANY_REQUESTS', 'rateLimited'],
    [500, 'INTERNAL_SERVER_ERROR', 'failed'],
    [401, 'UNAUTHORIZED', 'failed'],
  ])(
    'shows a localized error for %i / %s and permits retry',
    async (status, code, key) => {
      fetcher
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ code, message: 'Server error details' }),
            {
              status: Number(status),
            },
          ),
        )
        .mockResolvedValueOnce(successResponse());
      await renderScreen();
      await enterForm();
      await act(async () => submit());

      expectError(`auth.register.error.${key}`);
      expect(await services.session.getSession()).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(button('register-submit').props.disabled).toBe(false);
      expect(
        renderer.root
          .findAllByType(TextInput)
          .every(input => input.props.editable === true),
      ).toBe(true);
      expect(
        JSON.stringify([
          jest.mocked(ConsoleLogger.prototype.log).mock.calls,
          jest.mocked(services.analytics.track).mock.calls,
        ]),
      ).not.toContain(validForm.password);

      await act(async () => submit());
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(navigate).toHaveBeenCalledWith('Home');
    },
  );

  it('reports network failures without automatically retrying registration', async () => {
    fetcher.mockRejectedValue(new TypeError('Network request failed'));
    await renderScreen();
    await enterForm();
    await act(async () => submit());

    expectError('auth.register.error.failed');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await services.session.getSession()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rejects malformed successful responses without creating a session', async () => {
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'SUCCESS',
          data: { user: { id: 'user-1' }, tokens: {} },
        }),
        { status: 201 },
      ),
    );
    await renderScreen();
    await enterForm();
    await act(async () => submit());

    expect(await services.session.getSession()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expectError('auth.register.error.failed');
  });

  it('ignores responses arriving after leaving registration', async () => {
    const pending = deferredResponse();
    fetcher.mockReturnValue(pending.promise);
    await renderScreen();
    await enterForm();
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

  it.each([
    [LoginScreen, 'login-register-link'],
    [AccountPasswordLoginScreen, 'account-login-register'],
  ] as const)('opens the registered route from %p', async (Screen, testID) => {
    await renderScreen(Screen);
    await act(async () => button(testID).props.onPress());

    expect(navigate).toHaveBeenCalledWith('Register');
    expect(
      authModule.create({ brand: activeBrand, services }).routes,
    ).toContainEqual(
      expect.objectContaining({ name: 'Register', component: RegisterScreen }),
    );
  });

  it('returns to account login', async () => {
    await renderScreen();
    await act(async () => button('register-login-link').props.onPress());

    expect(navigate).toHaveBeenCalledWith('AccountPasswordLogin');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('renders registration and validation in English', async () => {
    await renderScreen(RegisterScreen, 'en-US');
    const title = services.i18n.t('auth.register.title');
    expect(title).not.toBe('auth.register.title');
    expect(title).toMatch(/[A-Za-z]/);
    expect(
      renderer.root
        .findAllByType(Text)
        .some(item => item.props.children === title),
    ).toBe(true);

    await enterForm({ confirmPassword: 'different-password' });
    await act(async () => submit());
    expectError('auth.register.error.confirmPassword');
    expect(services.i18n.t('auth.register.error.confirmPassword')).toMatch(
      /[A-Za-z]/,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
