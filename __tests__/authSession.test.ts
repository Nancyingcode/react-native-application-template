import {
  applyAuthTokens,
  InMemorySessionStore,
  InvalidRefreshSessionError,
  SessionManager,
  type AuthSession,
  type AuthTokensResponse,
} from '../src/core/auth';

const now = 1_800_000_000_000;
const identity = { userId: 'user-1', permissions: ['profile:read'] };
const tokens: AuthTokensResponse = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  tokenType: 'Bearer',
  accessExpiresInSeconds: 300,
  refreshExpiresInSeconds: 3600,
};

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('applyAuthTokens', () => {
  it('converts token lifetimes from seconds and preserves the user identity', () => {
    expect(applyAuthTokens(identity, tokens, now)).toEqual({
      ...identity,
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: now + 300_000,
      refreshExpiresAt: now + 3_600_000,
    });
  });

  it.each([
    { accessToken: '' },
    { refreshToken: '' },
    { tokenType: 'Basic' },
    { accessExpiresInSeconds: 0 },
    { accessExpiresInSeconds: -1 },
    { accessExpiresInSeconds: 0.5 },
    { accessExpiresInSeconds: Number.NaN },
    { refreshExpiresInSeconds: Infinity },
    { refreshExpiresInSeconds: Number.MAX_SAFE_INTEGER },
  ])('rejects unusable token responses: %p', invalidFields => {
    expect(() =>
      applyAuthTokens(identity, { ...tokens, ...invalidFields }, now),
    ).toThrow('Invalid authentication tokens');
  });
});

describe('SessionManager', () => {
  let session: SessionManager;
  let current: AuthSession;
  let refreshed: AuthSession;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
    session = new SessionManager(new InMemorySessionStore());
    current = applyAuthTokens(identity, tokens, now);
    refreshed = applyAuthTokens(
      identity,
      { ...tokens, accessToken: 'access-2', refreshToken: 'refresh-2' },
      now,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('publishes login, token rotation and logout, and supports unsubscribing', async () => {
    const observer = { onSessionChanged: jest.fn() };
    session = new SessionManager(new InMemorySessionStore(), observer);
    const snapshots: Array<AuthSession | null> = [];
    const unsubscribe = session.subscribe(() => {
      snapshots.push(session.getSnapshot());
    });

    expect(session.getSnapshot()).toBeNull();
    await session.setSession(current);
    await session.setSession(refreshed);
    await session.signOut();
    unsubscribe();
    await session.setSession(current);

    expect(snapshots).toEqual([current, refreshed, null]);
    expect(observer.onSessionChanged.mock.calls).toEqual([
      [current],
      [refreshed],
      [null],
      [current],
    ]);
    expect(session.getSnapshot()).toEqual(current);
  });

  it('returns an unexpired token without refreshing', async () => {
    const refresh = jest.fn().mockResolvedValue(refreshed);
    session.setRefresher(refresh);
    await session.setSession(current);

    await expect(session.getAccessToken()).resolves.toBe('access-1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shares one refresh across expired requests and uses the rotated refresh token next time', async () => {
    const pending = deferred<AuthSession>();
    const refresh = jest
      .fn<Promise<AuthSession>, [AuthSession]>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ...refreshed, accessToken: 'access-3' });
    session.setRefresher(refresh);
    await session.setSession({ ...current, expiresAt: now });

    const requests = [session.getAccessToken(), session.getAccessToken()];
    await Promise.resolve();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    pending.resolve(refreshed);

    await expect(Promise.all(requests)).resolves.toEqual([
      'access-2',
      'access-2',
    ]);
    expect(await session.getSession()).toEqual(refreshed);
    await expect(session.refreshAccessToken('access-2')).resolves.toBe(
      'access-3',
    );
    expect(refresh.mock.calls[1][0].refreshToken).toBe('refresh-2');
  });

  it('reuses a token already refreshed by a different rejected request', async () => {
    const refresh = jest.fn().mockResolvedValue(refreshed);
    session.setRefresher(refresh);
    await session.setSession(current);
    await session.refreshAccessToken('access-1');

    await expect(session.refreshAccessToken('access-1')).resolves.toBe(
      'access-2',
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([now, now + 300_000])(
    'does not refresh or reuse a different account for an old rejected token (expiresAt: %s)',
    async expiresAt => {
      const refresh = jest.fn().mockResolvedValue(refreshed);
      session.setRefresher(refresh);
      await session.setSession(current);
      const otherAccount = {
        ...current,
        userId: 'user-2',
        accessToken: 'other-access',
        expiresAt,
      };
      await session.setSession(otherAccount);

      await expect(
        session.refreshAccessToken('access-1'),
      ).resolves.toBeUndefined();
      expect(refresh).not.toHaveBeenCalled();
      expect(await session.getSession()).toEqual(otherAccount);
    },
  );

  it('does not invalidate a new account when an old request returns unauthorized', async () => {
    await session.setSession(refreshed);

    await session.invalidateAccessToken('access-1');

    expect(await session.getSession()).toEqual(refreshed);
  });

  it('preserves a login that starts while an old token is being invalidated', async () => {
    await session.setSession(current);
    const otherAccount = {
      ...current,
      userId: 'user-2',
      accessToken: 'other-access',
    };

    const invalidating = session.invalidateAccessToken('access-1');
    const signingIn = session.setSession(otherAccount);
    await Promise.all([invalidating, signingIn]);

    expect(await session.getSession()).toEqual(otherAccount);
    expect(session.getSnapshot()).toEqual(otherAccount);
  });

  it.each([{ refreshToken: undefined }, { refreshExpiresAt: now }])(
    'clears an expired session that cannot refresh: %p',
    async invalidFields => {
      const refresh = jest.fn().mockResolvedValue(refreshed);
      session.setRefresher(refresh);
      await session.setSession({
        ...current,
        expiresAt: now,
        ...invalidFields,
      });

      await expect(session.getAccessToken()).resolves.toBeUndefined();
      expect(refresh).not.toHaveBeenCalled();
      expect(await session.getSession()).toBeNull();
      expect(session.getSnapshot()).toBeNull();
    },
  );

  it('clears the session only when the refresh service explicitly invalidates it', async () => {
    const invalid = new InvalidRefreshSessionError();
    session.setRefresher(jest.fn().mockRejectedValue(invalid));
    await session.setSession(current);

    await expect(session.refreshAccessToken('access-1')).rejects.toBe(invalid);
    expect(await session.getSession()).toBeNull();
    expect(session.getSnapshot()).toBeNull();
  });

  it('preserves a session after a network failure so a later request can retry', async () => {
    const offline = new Error('offline');
    const refresh = jest
      .fn()
      .mockRejectedValueOnce(offline)
      .mockResolvedValueOnce(refreshed);
    session.setRefresher(refresh);
    await session.setSession({ ...current, expiresAt: now });

    await expect(session.getAccessToken()).rejects.toBe(offline);
    expect(await session.getSession()).toMatchObject({
      refreshToken: 'refresh-1',
    });
    expect(session.getSnapshot()?.userId).toBe('user-1');
    await expect(session.getAccessToken()).resolves.toBe('access-2');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not restore a session when a refresh finishes after logout', async () => {
    const pending = deferred<AuthSession>();
    session.setRefresher(() => pending.promise);
    await session.setSession(current);

    const refreshing = session.refreshAccessToken('access-1');
    await Promise.resolve();
    await session.signOut();
    pending.resolve(refreshed);

    await expect(refreshing).resolves.toBeUndefined();
    expect(await session.getSession()).toBeNull();
    expect(session.getSnapshot()).toBeNull();
  });

  it('does not replace a newly signed-in account with a late refresh response', async () => {
    const pending = deferred<AuthSession>();
    session.setRefresher(() => pending.promise);
    await session.setSession(current);

    const refreshing = session.refreshAccessToken('access-1');
    await Promise.resolve();
    const otherAccount = {
      ...current,
      userId: 'user-2',
      accessToken: 'other-access',
    };
    await session.setSession(otherAccount);
    pending.resolve(refreshed);

    await expect(refreshing).resolves.toBeUndefined();
    expect(await session.getSession()).toEqual(otherAccount);
    expect(session.getSnapshot()).toEqual(otherAccount);
  });

  it('preserves a login queued immediately after the refresh response arrives', async () => {
    const pending = deferred<AuthSession>();
    const signingIn = deferred<void>();
    session.setRefresher(() => pending.promise);
    await session.setSession(current);
    const otherAccount = {
      ...current,
      userId: 'user-2',
      accessToken: 'other-access',
    };

    const refreshing = session.refreshAccessToken('access-1');
    await Promise.resolve();
    pending.resolve(refreshed);
    queueMicrotask(() => {
      session.setSession(otherAccount).then(
        () => signingIn.resolve(undefined),
        error => signingIn.reject(error),
      );
    });
    await Promise.all([refreshing, signingIn.promise]);

    expect(await session.getSession()).toEqual(otherAccount);
    expect(session.getSnapshot()).toEqual(otherAccount);
  });

  it('does not sign out a new account when the previous account refresh fails', async () => {
    const pending = deferred<AuthSession>();
    session.setRefresher(() => pending.promise);
    await session.setSession(current);

    const refreshing = session.refreshAccessToken('access-1');
    await Promise.resolve();
    const otherAccount = {
      ...current,
      userId: 'user-2',
      accessToken: 'other-access',
    };
    await session.setSession(otherAccount);
    const invalid = new InvalidRefreshSessionError();
    pending.reject(invalid);

    await expect(refreshing).rejects.toBe(invalid);
    expect(await session.getSession()).toEqual(otherAccount);
    expect(session.getSnapshot()).toEqual(otherAccount);
  });
});
