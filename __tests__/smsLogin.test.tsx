import React from 'react';
import { AppState } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { AppNavigationProvider } from '../src/app/navigation';
import { useSmsLogin } from '../src/modules/auth/sms/useSmsLogin';
import {
  authentication,
  deferred,
  response,
  setupApplication,
} from '../src/modules/auth/sms/testing/fixtures';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

describe('SMS login intent and expiry', () => {
  let renderer: Renderer.ReactTestRenderer;
  let sms: ReturnType<typeof useSmsLogin>;
  let services: ReturnType<typeof setupApplication>;
  const navigate = jest.fn();
  function Harness() {
    sms = useSmsLogin();
    return null;
  }
  const sent = () =>
    response({
      data: {
        expiresAt: new Date(Date.now() + 90000).toISOString(),
        expiresInSeconds: 90,
        resendAfterSeconds: 17,
      },
    });
  async function mount() {
    services = setupApplication();
    await act(async () => {
      renderer = Renderer.create(
        <AppNavigationProvider navigate={navigate} params={{}}>
          <Harness />
        </AppNavigationProvider>,
      );
    });
    act(() => sms.changePhone('+8613800138000'));
  }
  beforeEach(() => {
    navigate.mockReset();
  });
  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer.unmount());
    }
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('uses server timing, blocks duplicate sends and recalculates on foreground', async () => {
    jest.useFakeTimers();
    const pending = deferred<Response>();
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockReturnValue(pending.promise);
    const listener = jest.spyOn(AppState, 'addEventListener');
    await mount();
    let completion!: Promise<void>;
    act(() => {
      completion = sms.sendCode();
      sms.sendCode();
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(sent());
      await completion;
    });
    expect(sms.resendSeconds).toBe(17);
    expect(sms.expiresSeconds).toBe(90);
    await act(async () => sms.sendCode());
    expect(fetcher).toHaveBeenCalledTimes(1);
    jest.setSystemTime(Date.now() + 20000);
    act(() => {
      listener.mock.calls[0][1]('active');
    });
    expect(sms.resendSeconds).toBe(0);
    expect(sms.expiresSeconds).toBe(70);
    act(() => {
      jest.advanceTimersByTime(70000);
    });
    act(() => sms.changeCode('123456'));
    await act(async () => sms.submit());
    expect(sms.errorKey).toBe('auth.login.phone.error.expired');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [429, 'RATE_LIMITED', 'rateLimited'],
    [503, 'SMS_UNAVAILABLE', 'unavailable'],
    [400, 'VALIDATION_FAILED', 'validation'],
  ])(
    'reports send failure %s without success or retry',
    async (status, code, suffix) => {
      const fetcher = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(response({ code }, status));
      await mount();
      await act(async () => sms.sendCode());
      expect(sms.sent).toBe(false);
      expect(sms.errorKey).toBe(`auth.login.phone.error.${suffix}`);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('reports unknown send result on network failure without replay', async () => {
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('offline'));
    await mount();
    await act(async () => sms.sendCode());
    expect(sms.sent).toBe(false);
    expect(sms.errorKey).toBe('auth.login.phone.error.sendUnknown');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retain an old success message when a resend result is unknown', async () => {
    jest.useFakeTimers();
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(async () => sent())
      .mockRejectedValueOnce(new TypeError('offline'));
    await mount();
    await act(async () => sms.sendCode());
    act(() => jest.advanceTimersByTime(18000));
    await act(async () => sms.sendCode());
    expect(sms.sent).toBe(false);
    expect(sms.errorKey).toBe('auth.login.phone.error.sendUnknown');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('clears code and timing on changing phone, including changing back', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => sent());
    await mount();
    await act(async () => sms.sendCode());
    act(() => sms.changeCode('123456'));
    act(() => sms.changePhone('+8613900139000'));
    act(() => sms.changePhone('+8613800138000'));
    expect(sms.code).toBe('');
    expect(sms.sent).toBe(false);
    expect(sms.resendSeconds).toBe(0);
  });

  it('ignores replaced send responses and preserves newer pending state', async () => {
    const old = deferred<Response>();
    const newer = deferred<Response>();
    jest
      .spyOn(global, 'fetch')
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(newer.promise);
    await mount();
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = sms.sendCode();
    });
    act(() => sms.changePhone('+8613900139000'));
    act(() => {
      second = sms.sendCode();
    });
    await act(async () => {
      old.resolve(sent());
      await first;
    });
    expect(sms.sent).toBe(false);
    expect(sms.busy).toBe('send');
    await act(async () => {
      newer.resolve(sent());
      await second;
    });
    expect(sms.sent).toBe(true);
  });

  it.each(['12345', '1234567', '123a56', '１２３４５６'])(
    'rejects invalid code %s before HTTP',
    async code => {
      const fetcher = jest.spyOn(global, 'fetch');
      await mount();
      act(() => sms.changeCode(code));
      await act(async () => sms.submit());
      expect(sms.errorKey).toBe('auth.login.phone.error.codeFormat');
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it('requires a country code', async () => {
    const fetcher = jest.spyOn(global, 'fetch');
    await mount();
    act(() => sms.changePhone('13800138000'));
    await act(async () => sms.sendCode());
    expect(sms.errorKey).toBe('auth.login.phone.error.phone');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'SMS_CODE_INVALID', 'invalidCode'],
    [401, 'INVALID_CREDENTIALS', 'account'],
    [403, 'USER_DISABLED', 'disabled'],
    [429, 'RATE_LIMITED', 'rateLimited'],
  ])('handles login failure %s %s', async (status, code, suffix) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response({ code }, status));
    await mount();
    act(() => sms.changeCode('123456'));
    await act(async () => sms.submit());
    expect(sms.errorKey).toBe(`auth.login.phone.error.${suffix}`);
    expect(services.session.getSnapshot()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('writes validated tokens once and navigates Home', async () => {
    const pending = deferred<Response>();
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockReturnValue(pending.promise);
    await mount();
    act(() => sms.changeCode('123456'));
    let completion!: Promise<void>;
    act(() => {
      completion = sms.submit();
      sms.submit();
    });
    expect(sms.busy).toBe('login');
    await act(async () => {
      pending.resolve(response({ data: authentication }));
      await completion;
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).has('Authorization'),
    ).toBe(false);
    expect(services.session.getSnapshot()).toMatchObject({
      userId: 'sms-test-user',
      permissions: [],
      refreshToken: 'test-refresh',
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('Home');
  });

  it.each(['unmount', 'phone', 'code', 'account', 'signOut'])(
    'ignores late login after %s',
    async change => {
      const pending = deferred<Response>();
      jest.spyOn(global, 'fetch').mockReturnValue(pending.promise);
      await mount();
      act(() => sms.changeCode('123456'));
      let completion!: Promise<void>;
      act(() => {
        completion = sms.submit();
      });
      const other = {
        userId: 'other',
        accessToken: 'other',
        refreshToken: 'other-refresh',
        permissions: [],
        expiresAt: Date.now() + 10000,
      };
      await act(async () => {
        if (change === 'unmount') {
          renderer.unmount();
        }
        if (change === 'phone') {
          sms.changePhone('+123456789');
        }
        if (change === 'code') {
          sms.changeCode('654321');
        }
        if (change === 'account') {
          await services.session.setSession(other);
        }
        if (change === 'signOut') {
          await services.session.signOut();
        }
      });
      await act(async () => {
        pending.resolve(response({ data: authentication }));
        await completion;
      });
      expect(navigate).not.toHaveBeenCalled();
      expect(services.session.getSnapshot()).toEqual(
        change === 'account' ? other : null,
      );
    },
  );

  it('does not replay unknown login results', async () => {
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('offline'));
    await mount();
    act(() => sms.changeCode('123456'));
    await act(async () => sms.submit());
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sms.errorKey).toBe('auth.login.phone.error.loginUnknown');
  });
});
