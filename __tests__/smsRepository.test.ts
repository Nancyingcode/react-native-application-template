import { HttpClient } from '../src/core/http';
import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { SmsRepository } from '../src/modules/auth/sms/repository';

describe('SMS wire contract and response validation', () => {
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const logger = { log: jest.fn(), child: jest.fn() };
  let repository: SmsRepository;
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1800000000000);
    fetcher.mockReset();
    logger.log.mockClear();
    repository = new SmsRepository(
      new HttpClient({
        baseUrl: 'http://localhost:3002',
        timeoutMs: 1000,
        session: new SessionManager(new InMemorySessionStore()),
        cache: new MemoryCache(),
        logger,
        fetcher,
      }),
    );
  });
  afterEach(() => jest.restoreAllMocks());
  const timing = () => ({
    expiresAt: new Date(Date.now() + 120000).toISOString(),
    expiresInSeconds: 90,
    resendAfterSeconds: 13,
  });
  function respond(data: unknown) {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ data }), { status: 200 }),
    );
  }

  it('sends normalized phone anonymously with retries disabled and uses both expiry limits', async () => {
    respond(timing());
    await expect(repository.sendCode(' +123456789 ')).resolves.toEqual({
      expiresAt: Date.now() + 90000,
      resendAt: Date.now() + 13000,
    });
    expect(fetcher.mock.calls[0][0]).toBe(
      'http://localhost:3002/api/v1/auth/sms/code',
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ phone: '+123456789' }),
      authenticated: false,
      retry: 0,
    });
    expect(logger.log).not.toHaveBeenCalled();
  });

  it.each([
    { expiresAt: 'invalid' },
    { expiresInSeconds: -1 },
    { resendAfterSeconds: -1 },
    { resendAfterSeconds: 0.5 },
    { expiresInSeconds: Number.MAX_SAFE_INTEGER },
  ])('rejects malformed timing %j', async invalid => {
    respond({ ...timing(), ...invalid });
    await expect(repository.sendCode('+123456789')).rejects.toThrow(
      'Invalid SMS timing response',
    );
  });

  it('accepts expired server timestamps as expired, never extends them', async () => {
    respond({
      ...timing(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const result = await repository.sendCode('+123456789');
    expect(result.expiresAt).toBeLessThan(Date.now());
  });

  it('rejects missing response envelope', async () => {
    respond(null);
    await expect(repository.sendCode('+123456789')).rejects.toThrow();
  });

  it('reuses authentication validation and rejects empty mock tokens', async () => {
    respond({
      user: { id: 'mock-user' },
      tokens: {
        accessToken: '',
        refreshToken: '',
        tokenType: 'Bearer',
        accessExpiresInSeconds: 900,
        refreshExpiresInSeconds: 3600,
      },
    });
    await expect(repository.login('+123456789', '123456')).rejects.toThrow(
      'Invalid authentication tokens',
    );
  });
});
