import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { AuthenticationRequiredError, HttpClient } from '../src/core/http';
import { ConsoleLogger } from '../src/core/logger';

describe('HttpClient authentication', () => {
  it('does not send an authenticated request without a valid session', async () => {
    const fetcher = jest.fn();
    const client = new HttpClient({
      baseUrl: 'https://api.example.test',
      timeoutMs: 1000,
      session: new SessionManager(new InMemorySessionStore()),
      cache: new MemoryCache(),
      logger: new ConsoleLogger({ scope: 'test' }),
      fetcher,
    });

    await expect(
      client.request('/private', { authenticated: true }),
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
