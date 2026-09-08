import {
  InMemorySessionStore,
  SessionManager,
  type AuthSession,
} from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { AuthenticationRequiredError, HttpClient } from '../src/core/http';
import { ConsoleLogger } from '../src/core/logger';
import {
  ProfileRepository,
  type UserProfile,
} from '../src/modules/auth/profileRepository';

const profile: UserProfile = {
  id: '019934ba-7437-7000-8000-000000000001',
  email: 'customer@example.com',
  phone: '+8613800138000',
  displayName: 'Mall Customer',
  status: 'ACTIVE',
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: '2026-09-08T09:30:00.000Z',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function createRepository(authenticated = true) {
  const session = new SessionManager(new InMemorySessionStore());
  const currentSession: AuthSession = {
    userId: profile.id,
    accessToken: 'profile-access-token',
    permissions: ['existing-permission'],
    expiresAt: Date.now() + 900_000,
  };
  if (authenticated) {
    await session.setSession(currentSession);
  }
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const logger = new ConsoleLogger({ scope: 'test' });
  jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  const cache = new MemoryCache();
  jest.spyOn(cache, 'get');
  jest.spyOn(cache, 'set');
  const http = new HttpClient({
    baseUrl: 'https://api.example.test',
    timeoutMs: 1000,
    session,
    cache,
    logger,
    fetcher,
  });
  return {
    repository: new ProfileRepository(http),
    session,
    currentSession,
    fetcher,
    cache,
  };
}

afterEach(() => jest.restoreAllMocks());

describe('profile API integration', () => {
  it('reads the authenticated user without caching or changing session permissions', async () => {
    const { repository, fetcher, session, currentSession, cache } =
      await createRepository();
    fetcher.mockImplementation(async () =>
      jsonResponse({ code: 'SUCCESS', data: profile }),
    );

    await expect(repository.getProfile()).resolves.toEqual(profile);
    await repository.getProfile();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/users/me',
      expect.objectContaining({ method: 'GET', authenticated: true }),
    );
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization'),
    ).toBe('Bearer profile-access-token');
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(await session.getSession()).toEqual(currentSession);
  });

  it.each(['ACTIVE', 'DISABLED', 'LOCKED'] as const)(
    'accepts nullable optional fields and the documented %s status',
    async status => {
      const { repository, fetcher } = await createRepository();
      const data = { ...profile, phone: null, displayName: null, status };
      fetcher.mockResolvedValue(jsonResponse({ data }));

      await expect(repository.getProfile()).resolves.toEqual(data);
    },
  );

  it('requires a session before performing a request', async () => {
    const { repository, fetcher } = await createRepository(false);

    await expect(repository.getProfile()).rejects.toBeInstanceOf(
      AuthenticationRequiredError,
    );

    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([403, 404, 429])('preserves HTTP %s errors', async status => {
    const { repository, fetcher, session, currentSession } =
      await createRepository();
    fetcher.mockResolvedValue(
      jsonResponse(
        { code: 'PROFILE_ERROR', message: 'Unable to read' },
        status,
      ),
    );

    await expect(repository.getProfile()).rejects.toMatchObject({
      status,
      code: 'PROFILE_ERROR',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await session.getSession()).toEqual(currentSession);
  });

  it('uses the existing HTTP session renewal on an expired access token', async () => {
    const { repository, fetcher, session, currentSession } =
      await createRepository();
    await session.setSession({ ...currentSession, refreshToken: 'refresh' });
    const renewed = { ...currentSession, accessToken: 'renewed-access-token' };
    const refresher = jest.fn().mockResolvedValue(renewed);
    session.setRefresher(refresher);
    const authorization: Array<string | null> = [];
    fetcher.mockImplementation(async (_url, options) => {
      authorization.push(new Headers(options?.headers).get('Authorization'));
      if (authorization.length === 1) {
        return jsonResponse({ code: 'TOKEN_EXPIRED' }, 401);
      }
      return jsonResponse({ data: profile });
    });

    await expect(repository.getProfile()).resolves.toEqual(profile);

    expect(authorization).toEqual([
      'Bearer profile-access-token',
      'Bearer renewed-access-token',
    ]);
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(await session.getSession()).toEqual(renewed);
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { ...profile, id: ' ' },
    { ...profile, email: 123 },
    { ...profile, phone: undefined },
    { ...profile, displayName: {} },
    { ...profile, status: 'UNKNOWN' },
    { ...profile, createdAt: 'invalid date' },
    { ...profile, updatedAt: 123456 },
  ])('rejects malformed profile data: %j', async data => {
    const { repository, fetcher, session, currentSession } =
      await createRepository();
    fetcher.mockResolvedValue(jsonResponse({ data }));

    await expect(repository.getProfile()).rejects.toThrow(
      'Invalid user profile response',
    );
    expect(await session.getSession()).toEqual(currentSession);
  });
});
