import { activeBrand } from '../src/brands/generated/activeBrand';
import {
  applyAuthTokens,
  InMemorySessionStore,
  SessionManager,
  type AuthTokensResponse,
} from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { AuthenticationRequiredError, HttpClient } from '../src/core/http';
import { ConsoleLogger } from '../src/core/logger';
import { createCoreServices } from '../src/core/services';

const tokens: AuthTokensResponse = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  tokenType: 'Bearer',
  accessExpiresInSeconds: 300,
  refreshExpiresInSeconds: 3600,
};
const identity = { userId: 'user-1', permissions: [] };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createClient() {
  const session = new SessionManager(new InMemorySessionStore());
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const logger = new ConsoleLogger({ scope: 'test' });
  jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  const client = new HttpClient({
    baseUrl: 'https://api.example.test',
    timeoutMs: 1000,
    session,
    cache: new MemoryCache(),
    logger,
    fetcher,
  });
  return { session, fetcher, client };
}

describe('HttpClient authentication', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not send an authenticated request without a valid session', async () => {
    const fetcher = jest.fn();
    const onRequestCompleted = jest.fn();
    const client = new HttpClient({
      baseUrl: 'https://api.example.test',
      timeoutMs: 1000,
      session: new SessionManager(new InMemorySessionStore()),
      cache: new MemoryCache(),
      logger: new ConsoleLogger({ scope: 'test' }),
      fetcher,
      onRequestCompleted,
    });

    await expect(
      client.request('/private', { authenticated: true }),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(fetcher).not.toHaveBeenCalled();
    expect(onRequestCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/private',
        success: false,
        source: 'client',
        errorCode: 'AUTHENTICATION_REQUIRED',
      }),
    );
  });

  it('refreshes a rejected token once and replays the same request with the new bearer token', async () => {
    const { session, fetcher, client } = createClient();
    const current = applyAuthTokens(identity, tokens);
    const refresh = jest.fn().mockResolvedValue({
      ...current,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
    session.setRefresher(refresh);
    await session.setSession(current);
    const authorization: Array<string | null> = [];
    fetcher.mockImplementation(async (_input, init) => {
      authorization.push(new Headers(init?.headers).get('Authorization'));
      return authorization.length === 1
        ? jsonResponse({ code: 'TOKEN_INVALID' }, 401)
        : jsonResponse({ data: { saved: true } });
    });

    await expect(
      client.request('/private', {
        method: 'PATCH',
        body: { name: 'Updated' },
        retry: 0,
      }),
    ).resolves.toEqual({ data: { saved: true } });

    expect(authorization).toEqual(['Bearer access-1', 'Bearer access-2']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, request] of fetcher.mock.calls) {
      expect(url).toBe('https://api.example.test/private');
      expect(request).toMatchObject({
        method: 'PATCH',
        body: '{"name":"Updated"}',
      });
    }
  });

  it('stops after a second unauthorized response and clears the rejected session', async () => {
    const { session, fetcher, client } = createClient();
    const current = applyAuthTokens(identity, tokens);
    const refresh = jest
      .fn()
      .mockResolvedValue({ ...current, accessToken: 'access-2' });
    session.setRefresher(refresh);
    await session.setSession(current);
    fetcher.mockImplementation(async () =>
      jsonResponse({ code: 'TOKEN_INVALID' }, 401),
    );

    await expect(
      client.request('/private', { retry: 2 }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_INVALID',
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await session.getSession()).toBeNull();
  });

  it('sends public requests without session credentials and does not refresh their 401 responses', async () => {
    const { session, fetcher, client } = createClient();
    const current = applyAuthTokens(identity, tokens);
    const refresh = jest.fn();
    session.setRefresher(refresh);
    await session.setSession(current);
    fetcher.mockResolvedValue(
      jsonResponse({ code: 'INVALID_CREDENTIALS' }, 401),
    );

    await expect(
      client.request('/login', { authenticated: false, retry: 0 }),
    ).rejects.toMatchObject({ status: 401 });

    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).has('Authorization'),
    ).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(await session.getSession()).toEqual(current);
  });
});

describe('CoreServices token refresh integration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createServices() {
    const fetcher = jest.spyOn(global, 'fetch');
    const services = createCoreServices(activeBrand);
    jest.spyOn(services.logger, 'log').mockImplementation(() => undefined);
    return { fetcher, services };
  }

  it('posts the refresh token without authorization and then authenticates the waiting request', async () => {
    const now = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const { fetcher, services } = createServices();
    await services.session.setSession({
      ...applyAuthTokens(identity, tokens),
      expiresAt: now,
    });
    fetcher
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            ...tokens,
            accessToken: 'access-2',
            refreshToken: 'refresh-2',
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'user-1' } }));

    await expect(
      services.http.request('/private', { retry: 0 }),
    ).resolves.toEqual({
      data: { id: 'user-1' },
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [refreshUrl, refreshRequest] = fetcher.mock.calls[0];
    expect(refreshUrl).toBe(
      `${activeBrand.environments.development.apiBaseUrl}/api/v1/auth/refresh`,
    );
    expect(refreshRequest).toMatchObject({
      method: 'POST',
      body: '{"refreshToken":"refresh-1"}',
    });
    expect(new Headers(refreshRequest?.headers).has('Authorization')).toBe(
      false,
    );
    expect(
      new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization'),
    ).toBe('Bearer access-2');
    expect(await services.session.getSession()).toMatchObject({
      ...identity,
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresAt: now + 300_000,
      refreshExpiresAt: now + 3_600_000,
    });
  });

  it('clears a refresh token explicitly rejected by the API with status 400', async () => {
    const { fetcher, services } = createServices();
    await services.session.setSession({
      ...applyAuthTokens(identity, tokens),
      expiresAt: 0,
    });
    fetcher.mockResolvedValue(
      jsonResponse({ code: 'REFRESH_TOKEN_INVALID' }, 400),
    );

    await expect(
      services.http.request('/private', { retry: 0 }),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await services.session.getSession()).toBeNull();
    expect(services.session.getSnapshot()).toBeNull();
  });

  it('does not replay a failed refresh request and retains the session after a server error', async () => {
    const { fetcher, services } = createServices();
    const current = { ...applyAuthTokens(identity, tokens), expiresAt: 0 };
    await services.session.setSession(current);
    fetcher.mockResolvedValue(jsonResponse({ code: 'INTERNAL_ERROR' }, 500));

    await expect(
      services.http.request('/private', { retry: 0 }),
    ).rejects.toMatchObject({
      status: 500,
      code: 'INTERNAL_ERROR',
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await services.session.getSession()).toEqual(current);
    expect(services.session.getSnapshot()).toEqual(current);
  });

  it.each(['network', 'server'])(
    'does not retry the original 401 after a %s refresh failure',
    async failure => {
      const { fetcher, services } = createServices();
      const current = applyAuthTokens(identity, tokens);
      await services.session.setSession(current);
      fetcher.mockResolvedValueOnce(
        jsonResponse({ code: 'TOKEN_INVALID' }, 401),
      );
      if (failure === 'network') {
        fetcher.mockRejectedValueOnce(new Error('offline'));
      } else {
        fetcher.mockResolvedValueOnce(
          jsonResponse({ code: 'INTERNAL_ERROR' }, 500),
        );
      }

      await expect(services.http.request('/private')).rejects.toBeInstanceOf(
        Error,
      );

      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(await services.session.getSession()).toEqual(current);
      expect(services.session.getSnapshot()).toEqual(current);
    },
  );
});
