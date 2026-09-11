import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { HttpClient } from '../src/core/http';
import { ConsoleLogger } from '../src/core/logger';
import { AfterSalesRepository } from '../src/modules/commerce/after-sales/repository';

const input = {
  orderId: 'order',
  reason: 'damaged',
  items: [{ orderItemId: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
};
function response(status: number, data: unknown) {
  return {
    status,
    ok: status < 400,
    headers: new Headers(),
    text: async () => JSON.stringify(data),
  } as Response;
}
describe('after-sales through shared HttpClient', () => {
  const fetcher = jest.fn();
  let session: SessionManager;
  let repository: AfterSalesRepository;
  beforeEach(async () => {
    fetcher.mockReset();
    session = new SessionManager(new InMemorySessionStore());
    await session.setSession({
      userId: 'a',
      accessToken: 'old',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60000,
      permissions: [],
    });
    const logger = new ConsoleLogger({});
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    repository = new AfterSalesRepository(
      new HttpClient({
        baseUrl: 'https://example.invalid',
        timeoutMs: 1000,
        session,
        cache: new MemoryCache(),
        logger,
        fetcher,
      }),
    );
  });
  afterEach(() => jest.restoreAllMocks());
  it.each(['refund', 'afterSale'])(
    'does not replay %s on 503 or network failure',
    async flow => {
      for (const failure of ['503', 'network']) {
        fetcher.mockReset();
        if (failure === '503') {
          fetcher.mockResolvedValue(response(503, {}));
        } else {
          fetcher.mockRejectedValue(new Error('offline'));
        }
        const request =
          flow === 'refund'
            ? repository.requestRefund(input, {
                idempotencyKey: 'original-key',
              })
            : repository.requestAfterSale({ ...input, type: 'REFUND_ONLY' });
        if (failure === '503') {
          await expect(request).rejects.toMatchObject({ status: 503 });
        } else {
          await expect(request).rejects.toThrow('offline');
        }
        expect(fetcher).toHaveBeenCalledTimes(1);
      }
    },
  );
  it('preserves the refund body and operation header during the existing 401 refresh path', async () => {
    session.setRefresher(async current => ({
      ...current,
      accessToken: 'fresh',
      expiresAt: Date.now() + 60000,
    }));
    const sent: { body: unknown; key: string | null; auth: string | null }[] =
      [];
    fetcher.mockImplementation(async (_url, init: RequestInit) => {
      const headers = new Headers(init.headers);
      sent.push({
        body: init.body,
        key: headers.get('Idempotency-Key'),
        auth: headers.get('Authorization'),
      });
      return sent.length === 1
        ? response(401, {})
        : response(201, {
            data: { id: 'r', orderId: 'order', status: 'PENDING' },
          });
    });
    await repository.requestRefund(input, { idempotencyKey: 'original-key' });
    expect(sent).toHaveLength(2);
    expect(sent[0].body).toEqual(sent[1].body);
    expect(sent.map(item => item.key)).toEqual([
      'original-key',
      'original-key',
    ]);
    expect(sent.map(item => item.auth)).toEqual(['Bearer old', 'Bearer fresh']);
  });
});
