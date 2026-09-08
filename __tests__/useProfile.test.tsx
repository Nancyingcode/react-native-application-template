import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useApplication } from '../src/app/ApplicationProvider';
import { activeBrand } from '../src/brands/generated/activeBrand';
import { InvalidRefreshSessionError, type AuthSession } from '../src/core/auth';
import { ApiError, AuthenticationRequiredError } from '../src/core/http';
import { ConsoleLogger } from '../src/core/logger';
import { createCoreServices } from '../src/core/services';
import {
  ProfileRepository,
  type UserProfile,
} from '../src/modules/auth/profileRepository';
import { useProfile } from '../src/modules/auth/useProfile';

jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: jest.fn(),
}));

const renderers: ReactTestRenderer.ReactTestRenderer[] = [];

function profile(id = 'one'): UserProfile {
  return {
    id,
    email: `${id}@example.com`,
    phone: null,
    displayName: id,
    status: 'ACTIVE',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-08T09:30:00.000Z',
  };
}

function session(userId = 'one', accessToken = `${userId}-token`): AuthSession {
  return {
    userId,
    accessToken,
    expiresAt: Date.now() + 900_000,
    permissions: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function createContext(authenticated = true) {
  const services = createCoreServices(activeBrand);
  jest.spyOn(services.analytics, 'track').mockImplementation(() => undefined);
  jest
    .spyOn(services.analytics, 'identify')
    .mockImplementation(() => undefined);
  jest.spyOn(services.analytics, 'reset').mockImplementation(() => undefined);
  jest.spyOn(services.monitor, 'capture').mockImplementation(() => undefined);
  if (authenticated) {
    await services.session.setSession(session());
  }
  jest.mocked(useApplication).mockReturnValue({
    brand: activeBrand,
    environment: 'development',
    services,
    locale: activeBrand.defaultLocale,
    modules: [],
    application: {
      routes: [],
      menu: [],
      home: [],
      login: [],
      initialRoute: 'Home',
    },
    setLocale: jest.fn(),
    setServerFlags: jest.fn(),
  });
  return services;
}

async function renderHook() {
  let current!: ReturnType<typeof useProfile>;
  const renders: Array<ReturnType<typeof useProfile>> = [];
  function Harness() {
    current = useProfile();
    renders.push(current);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
  });
  renderers.push(renderer);
  return {
    get current() {
      return current;
    },
    renders,
    async unmount() {
      await act(async () => renderer.unmount());
      renderers.splice(renderers.indexOf(renderer), 1);
    },
  };
}

beforeEach(() => {
  jest
    .spyOn(ConsoleLogger.prototype, 'log')
    .mockImplementation(() => undefined);
});

afterEach(async () => {
  await act(async () => {
    renderers.splice(0).forEach(renderer => renderer.unmount());
  });
  jest.restoreAllMocks();
});

describe('useProfile', () => {
  it('loads automatically and prevents duplicate requests while loading', async () => {
    const pending = deferred<UserProfile>();
    const getProfile = jest
      .spyOn(ProfileRepository.prototype, 'getProfile')
      .mockReturnValue(pending.promise);
    await createContext();
    const hook = await renderHook();

    expect(hook.current).toMatchObject({
      profile: undefined,
      loading: true,
      refreshing: false,
      errorKey: null,
    });
    await act(async () => {
      hook.current.refresh();
      hook.current.refresh();
    });
    expect(getProfile).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(profile()));
    expect(hook.current).toMatchObject({
      profile: profile(),
      loading: false,
      refreshing: false,
      errorKey: null,
    });
  });

  it('retries an initial failure and retains the same account data if refresh fails', async () => {
    const offline = new Error('offline');
    const pending = deferred<UserProfile>();
    const getProfile = jest
      .spyOn(ProfileRepository.prototype, 'getProfile')
      .mockRejectedValueOnce(offline)
      .mockResolvedValueOnce(profile())
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ...profile(), displayName: 'Updated' });
    const services = await createContext();
    const hook = await renderHook();
    expect(hook.current).toMatchObject({
      profile: undefined,
      loading: false,
      errorKey: 'auth.profile.error.failed',
    });

    await act(async () => hook.current.refresh());
    expect(hook.current.profile).toEqual(profile());
    await act(async () => {
      hook.current.refresh();
      hook.current.refresh();
    });
    expect(getProfile).toHaveBeenCalledTimes(3);
    expect(hook.current).toMatchObject({
      profile: profile(),
      refreshing: true,
      loading: false,
      errorKey: null,
    });
    await act(async () => pending.reject(offline));
    expect(hook.current).toMatchObject({
      profile: profile(),
      refreshing: false,
      errorKey: 'auth.profile.error.failed',
    });
    await act(async () => hook.current.refresh());
    expect(hook.current.profile?.displayName).toBe('Updated');
    expect(hook.current.errorKey).toBeNull();
    expect(services.monitor.capture).toHaveBeenCalledTimes(2);
  });

  it.each([
    [new ApiError('missing', 404, 'USER_NOT_FOUND'), 'unavailable'],
    [new ApiError('denied', 403, 'FORBIDDEN'), 'forbidden'],
    [new ApiError('slow down', 429, 'RATE_LIMITED'), 'rateLimited'],
    [new ApiError('expired', 401, 'TOKEN_EXPIRED'), 'session'],
    [new AuthenticationRequiredError(), 'session'],
    [new InvalidRefreshSessionError(), 'session'],
    [new ApiError('server error', 500, 'INTERNAL_ERROR'), 'failed'],
  ])('maps %s to the %s message', async (error, errorKey) => {
    jest
      .spyOn(ProfileRepository.prototype, 'getProfile')
      .mockRejectedValue(error);
    await createContext();
    const hook = await renderHook();

    expect(hook.current).toMatchObject({
      profile: undefined,
      loading: false,
      refreshing: false,
      errorKey: `auth.profile.error.${errorKey}`,
    });
  });

  it('does not request a profile until signed in and immediately hides it after sign out', async () => {
    const getProfile = jest
      .spyOn(ProfileRepository.prototype, 'getProfile')
      .mockResolvedValue(profile());
    const services = await createContext(false);
    const hook = await renderHook();
    await act(async () => hook.current.refresh());
    expect(getProfile).not.toHaveBeenCalled();
    expect(hook.current).toMatchObject({
      profile: undefined,
      loading: false,
      errorKey: 'auth.profile.error.session',
    });

    await act(async () => services.session.setSession(session()));
    expect(hook.current.profile).toEqual(profile());
    const renderCount = hook.renders.length;
    await act(async () => services.session.signOut());
    expect(hook.renders[renderCount]).toMatchObject({
      profile: undefined,
      loading: false,
      refreshing: false,
      errorKey: 'auth.profile.error.session',
    });
    await act(async () => hook.current.refresh());
    expect(getProfile).toHaveBeenCalledTimes(1);
  });

  it('hides old data on the first render after switching accounts and ignores stale refresh results', async () => {
    const old = deferred<UserProfile>();
    const next = deferred<UserProfile>();
    const getProfile = jest
      .spyOn(ProfileRepository.prototype, 'getProfile')
      .mockResolvedValueOnce(profile())
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    const services = await createContext();
    const hook = await renderHook();
    await act(async () => hook.current.refresh());
    const renderCount = hook.renders.length;

    await act(async () => services.session.setSession(session('two')));

    expect(hook.renders[renderCount]).toMatchObject({
      profile: undefined,
      loading: true,
      refreshing: false,
      errorKey: null,
    });
    expect(getProfile).toHaveBeenCalledTimes(3);
    await act(async () => next.resolve(profile('two')));
    await act(async () => old.resolve(profile()));
    expect(hook.current.profile).toEqual(profile('two'));
    expect(services.monitor.capture).not.toHaveBeenCalled();
  });

  it('ignores a previous account failure after a new account request succeeds', async () => {
    const old = deferred<UserProfile>();
    jest
      .spyOn(ProfileRepository.prototype, 'getProfile')
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(profile('two'));
    const services = await createContext();
    const hook = await renderHook();

    await act(async () => services.session.setSession(session('two')));
    await act(async () => old.reject(new Error('old account failed')));

    expect(hook.current).toMatchObject({
      profile: profile('two'),
      errorKey: null,
    });
    expect(services.monitor.capture).not.toHaveBeenCalled();
  });

  it('continues a pending load when the same account rotates its access token', async () => {
    const pending = deferred<UserProfile>();
    const getProfile = jest
      .spyOn(ProfileRepository.prototype, 'getProfile')
      .mockReturnValue(pending.promise);
    const services = await createContext();
    const hook = await renderHook();

    await act(async () =>
      services.session.setSession(session('one', 'renewed-token')),
    );
    await act(async () => pending.resolve(profile()));
    await act(async () =>
      services.session.setSession(session('one', 'renewed-again')),
    );

    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(hook.current).toMatchObject({ profile: profile(), loading: false });
  });

  it('rejects a response belonging to a different account', async () => {
    jest
      .spyOn(ProfileRepository.prototype, 'getProfile')
      .mockResolvedValue(profile('unexpected-account'));
    await createContext();
    const hook = await renderHook();

    expect(hook.current).toMatchObject({
      profile: undefined,
      loading: false,
      errorKey: 'auth.profile.error.failed',
    });
  });

  it.each(['success', 'failure'])(
    'ignores a request %s and further refreshes after unmount',
    async outcome => {
      const pending = deferred<UserProfile>();
      const getProfile = jest
        .spyOn(ProfileRepository.prototype, 'getProfile')
        .mockReturnValue(pending.promise);
      const services = await createContext();
      const hook = await renderHook();
      await hook.unmount();
      const renderCount = hook.renders.length;

      await act(async () => {
        if (outcome === 'success') {
          pending.resolve(profile());
        } else {
          pending.reject(new Error('unmounted'));
        }
        hook.current.refresh();
      });

      expect(hook.renders).toHaveLength(renderCount);
      expect(getProfile).toHaveBeenCalledTimes(1);
      expect(services.monitor.capture).not.toHaveBeenCalled();
    },
  );
});
