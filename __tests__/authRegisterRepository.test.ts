import {
  applyAuthTokens,
  InMemorySessionStore,
  SessionManager,
  type AuthTokensResponse,
} from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { HttpClient } from '../src/core/http';
import { ConsoleLogger } from '../src/core/logger';
import { AuthRepository } from '../src/modules/auth/repository';

const tokens: AuthTokensResponse = {
  accessToken: 'registered-access-token',
  refreshToken: 'registered-refresh-token',
  tokenType: 'Bearer',
  accessExpiresInSeconds: 900,
  refreshExpiresInSeconds: 2592000,
};
const registration = {
  email: 'customer@example.com',
  password: ' StrongPassword123! ',
};
const user = { id: '019934ba-7437-7000-8000-000000000001' };

function jsonResponse(data: unknown, status = 201): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createRepository() {
  const session = new SessionManager(new InMemorySessionStore());
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const logger = new ConsoleLogger({ scope: 'test' });
  jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  const http = new HttpClient({
    baseUrl: 'https://api.example.test',
    timeoutMs: 1000,
    session,
    cache: new MemoryCache(),
    logger,
    fetcher,
  });
  return { repository: new AuthRepository(http), session, fetcher };
}

describe('registration API integration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts registration fields publicly and converts the issued tokens into a session', async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const { repository, fetcher, session } = createRepository();
    const existingSession = applyAuthTokens(
      { userId: 'existing-user', permissions: ['existing-permission'] },
      { ...tokens, accessToken: 'existing-access-token' },
    );
    await session.setSession(existingSession);
    fetcher.mockResolvedValue(
      jsonResponse({ code: 'SUCCESS', data: { user, tokens } }),
    );

    await expect(
      repository.register({
        ...registration,
        email: ' customer@example.com ',
        phone: ' +8613800138000 ',
        displayName: ' Mall Customer ',
      }),
    ).resolves.toEqual({
      userId: user.id,
      permissions: [],
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: now + 900_000,
      refreshExpiresAt: now + 2_592_000_000,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          ...registration,
          phone: '+8613800138000',
          displayName: 'Mall Customer',
        }),
        authenticated: false,
        retry: 0,
      }),
    );
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).has('Authorization'),
    ).toBe(false);
    expect(await session.getSession()).toEqual(existingSession);
  });

  it.each([{}, { phone: '  ', displayName: '  ' }])(
    'omits empty optional profile fields: %j',
    async optionalFields => {
      const { repository, fetcher } = createRepository();
      fetcher.mockResolvedValue(
        jsonResponse({ code: 'SUCCESS', data: { user, tokens } }),
      );

      await repository.register({ ...registration, ...optionalFields });

      expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify(registration));
    },
  );

  it.each([
    ['USER_ALREADY_EXISTS', 409],
    ['VALIDATION_FAILED', 400],
  ])(
    'preserves the documented %s error without creating a session',
    async (code, status) => {
      const { repository, fetcher, session } = createRepository();
      fetcher.mockResolvedValue(jsonResponse({ code, message: code }, status));

      await expect(repository.register(registration)).rejects.toMatchObject({
        status,
        code,
      });

      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(await session.getSession()).toBeNull();
    },
  );

  it.each(['network', 'server'])(
    'does not automatically repeat registration after a %s failure',
    async failure => {
      const { repository, fetcher } = createRepository();
      if (failure === 'network') {
        fetcher.mockRejectedValue(new Error('offline'));
      } else {
        fetcher.mockResolvedValue(
          jsonResponse({ code: 'INTERNAL_SERVER_ERROR' }, 500),
        );
      }

      await expect(repository.register(registration)).rejects.toBeInstanceOf(
        Error,
      );

      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    undefined,
    {},
    { user: {}, tokens },
    { user: { id: ' ' }, tokens },
    { user, tokens: {} },
    { user, tokens: { ...tokens, tokenType: 'Basic' } },
    { user, tokens: { ...tokens, accessExpiresInSeconds: 0 } },
  ])('rejects a malformed success payload: %j', async data => {
    const { repository, fetcher, session } = createRepository();
    fetcher.mockResolvedValue(jsonResponse({ code: 'SUCCESS', data }));

    await expect(repository.register(registration)).rejects.toBeInstanceOf(
      Error,
    );

    expect(await session.getSession()).toBeNull();
  });
});
