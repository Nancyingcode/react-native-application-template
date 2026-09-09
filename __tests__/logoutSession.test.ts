import {
  InMemorySessionStore,
  SessionManager,
  type AuthSession,
} from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { HttpClient } from '../src/core/http';
import { logoutSession } from '../src/modules/auth/logout/service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const current: AuthSession = {
  userId: 'a',
  accessToken: 'access-a',
  refreshToken: 'refresh-a',
  expiresAt: Date.now() + 60000,
  permissions: [],
};
const rotated: AuthSession = {
  ...current,
  accessToken: 'rotated-access',
  refreshToken: 'rotated-refresh',
};
const other: AuthSession = {
  ...current,
  userId: 'b',
  accessToken: 'access-b',
  refreshToken: 'refresh-b',
};

describe('logout remote revocation and local isolation', () => {
  let session: SessionManager;
  let http: HttpClient;
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  beforeEach(async () => {
    fetcher.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    session = new SessionManager(new InMemorySessionStore());
    http = new HttpClient({
      baseUrl: 'http://localhost:3002',
      timeoutMs: 1000,
      session,
      cache: new MemoryCache(),
      logger: { log: jest.fn(), child: jest.fn() },
      fetcher,
    });
    await session.setSession(current);
  });

  it('clears locally before network completion and shares duplicate requests', async () => {
    const pending = deferred<Response>();
    fetcher.mockReturnValue(pending.promise);
    const first = logoutSession(http, session, current);
    const duplicate = logoutSession(http, session, current);
    expect(duplicate).toBe(first);
    await Promise.resolve();
    await Promise.resolve();
    expect(await session.getSession()).toBeNull();
    expect(session.getSnapshot()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      'http://localhost:3002/api/v1/auth/logout',
    );
    expect(fetcher.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ refreshToken: 'refresh-a' }),
    );
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).has('Authorization'),
    ).toBe(false);
    pending.resolve(new Response(null, { status: 204 }));
    await expect(first).resolves.toBe('revoked');
  });

  it.each([401, 429, 503])(
    'reports remote failure %s with local session cleared',
    async status => {
      fetcher.mockResolvedValue(
        new Response(JSON.stringify({ code: 'ERROR' }), { status }),
      );
      await expect(logoutSession(http, session, current)).resolves.toBe(
        'unconfirmed',
      );
      expect(session.getSnapshot()).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('does not replay a network failure', async () => {
    fetcher.mockRejectedValue(new TypeError('offline'));
    await expect(logoutSession(http, session, current)).resolves.toBe(
      'unconfirmed',
    );
    expect(await session.getSession()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('remembers unknown rotation even when it failed before logout began', async () => {
    session.setRefresher(async () => {
      throw new TypeError('response lost');
    });
    await expect(
      session.refreshAccessToken(current.accessToken),
    ).rejects.toThrow('response lost');
    await expect(logoutSession(http, session, current)).resolves.toBe(
      'unconfirmed',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toBeNull();
  });

  it('does not clear an account signed in while remote logout was pending', async () => {
    const pending = deferred<Response>();
    fetcher.mockReturnValue(pending.promise);
    const completion = logoutSession(http, session, current);
    await session.setSession(other);
    await Promise.resolve();
    await Promise.resolve();
    pending.resolve(new Response(null, { status: 204 }));
    await completion;
    expect(await session.getSession()).toEqual(other);
    expect(session.getSnapshot()).toEqual(other);
  });

  it('rejects stale confirmation, even for the same user with a new session', async () => {
    await session.setSession({ ...current });
    await expect(logoutSession(http, session, current)).resolves.toBe(
      'sessionChanged',
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(session.getSnapshot()?.userId).toBe('a');
  });

  it('does not clear a new login whose snapshot has not yet published', async () => {
    const login = session.setSession(other);
    await expect(logoutSession(http, session, current)).resolves.toBe(
      'sessionChanged',
    );
    await login;
    expect(await session.getSession()).toEqual(other);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('waits for in-flight rotation and revokes the rotated token without restoring locally', async () => {
    const pending = deferred<AuthSession>();
    session.setRefresher(() => pending.promise);
    const refresh = session.refreshAccessToken(current.accessToken);
    await Promise.resolve();
    const logout = logoutSession(http, session, current);
    await Promise.resolve();
    expect(session.getSnapshot()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    pending.resolve(rotated);
    await expect(refresh).resolves.toBeUndefined();
    await expect(logout).resolves.toBe('revoked');
    expect(fetcher.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ refreshToken: 'rotated-refresh' }),
    );
    expect(session.getSnapshot()).toBeNull();
    expect(await session.getSession()).toBeNull();
  });

  it('keeps a new account during old rotation and revocation', async () => {
    const pending = deferred<AuthSession>();
    session.setRefresher(() => pending.promise);
    const refresh = session.refreshAccessToken(current.accessToken);
    await Promise.resolve();
    const logout = logoutSession(http, session, current);
    await session.setSession(other);
    pending.resolve(rotated);
    await refresh;
    await logout;
    expect(await session.getSession()).toEqual(other);
    expect(fetcher.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ refreshToken: 'rotated-refresh' }),
    );
  });

  it('does not claim complete revocation when rotation result was lost', async () => {
    const pending = deferred<AuthSession>();
    session.setRefresher(() => pending.promise);
    const refresh = session
      .refreshAccessToken(current.accessToken)
      .catch(() => undefined);
    await Promise.resolve();
    const logout = logoutSession(http, session, current);
    pending.reject(new TypeError('refresh response lost'));
    await refresh;
    await expect(logout).resolves.toBe('unconfirmed');
    expect(fetcher.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ refreshToken: 'refresh-a' }),
    );
    expect(session.getSnapshot()).toBeNull();
  });

  it('prevents refresh still reading the store from starting after logout', async () => {
    const refresher = jest.fn(async () => rotated);
    session.setRefresher(refresher);
    const refreshing = session.refreshAccessToken(current.accessToken);
    const logout = logoutSession(http, session, current);
    await refreshing;
    await logout;
    expect(refresher).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBeNull();
  });

  it('clears local sessions without a refresh token but reports remote uncertainty', async () => {
    const legacy = { ...current, refreshToken: undefined };
    await session.setSession(legacy);
    await expect(logoutSession(http, session, legacy)).resolves.toBe(
      'unconfirmed',
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBeNull();
  });

  it('reports local store failure without claiming local logout', async () => {
    const store = new InMemorySessionStore();
    session = new SessionManager(store);
    await session.setSession(current);
    jest
      .spyOn(store, 'clear')
      .mockRejectedValueOnce(new Error('storage failure'));
    await expect(logoutSession(http, session, current)).resolves.toBe(
      'localFailed',
    );
    expect(fetcher).not.toHaveBeenCalled();
    await expect(logoutSession(http, session, current)).resolves.toBe(
      'revoked',
    );
  });
});
