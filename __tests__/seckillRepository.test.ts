import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { HttpClient } from '../src/core/http';
import { SeckillRepository } from '../src/modules/commerce/seckill/repository';
import {
  activity,
  address,
} from '../src/modules/commerce/seckill/testing/fixtures';

describe('seckill frozen wire contract', () => {
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  let repository: SeckillRepository;
  beforeEach(async () => {
    fetcher.mockReset();
    const session = new SessionManager(new InMemorySessionStore());
    await session.setSession({
      userId: 'a',
      accessToken: 'access',
      permissions: [],
      expiresAt: Date.now() + 60000,
    });
    repository = new SeckillRepository(
      new HttpClient({
        baseUrl: 'https://api.test',
        timeoutMs: 500,
        session,
        cache: new MemoryCache(),
        logger: { log: jest.fn(), child: jest.fn() },
        fetcher,
      }),
    );
  });
  function respond(data: unknown) {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ data }), { status: 200 }),
    );
  }
  it('reads only mobile endpoints, unwraps once, preserves Decimal and authenticates reads', async () => {
    respond([activity]);
    expect(await repository.list()).toEqual([activity]);
    respond(activity);
    expect(await repository.get(activity.id)).toEqual(activity);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      'https://api.test/api/v1/seckill/activities',
      'https://api.test/api/v1/seckill/activities/activity%2Fa',
    ]);
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization'),
    ).toBe('Bearer access');
  });
  it('issues a token without cache or network replay', async () => {
    fetcher.mockRejectedValue(new Error('offline'));
    await expect(repository.token(activity.id)).rejects.toThrow('offline');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://api.test/api/v1/seckill/activity%2Fa/token',
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({ retry: 0 });
  });
  it('sends the exact normalized DTO, no invented idempotency header or order', async () => {
    respond({ status: 'QUEUED', requestId: 'request-id' });
    expect(
      await repository.request(activity.id, 'sku/a', {
        token: 'secret',
        quantity: 2,
        shippingAddress: address,
      }),
    ).toEqual({ status: 'QUEUED', requestId: 'request-id' });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(
      'https://api.test/api/v1/seckill/activity%2Fa/skus/sku%2Fa/request',
    );
    expect(options).toMatchObject({ method: 'POST', retry: 0 });
    expect(JSON.parse(String(options?.body))).toEqual({
      token: 'secret',
      quantity: 2,
      shippingAddress: {
        recipient: 'Person',
        phone: '+123',
        province: 'Province',
        city: 'City',
        addressLine: 'Street',
      },
    });
    expect(new Headers(options?.headers).has('Idempotency-Key')).toBe(false);
  });
  it.each([0, 11, 1.5, NaN])(
    'rejects invalid quantity %s without network',
    async quantity => {
      await expect(
        repository.request(activity.id, 'sku/a', {
          token: 'secret',
          quantity,
          shippingAddress: address,
        }),
      ).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it('does not replay POST 503', async () => {
    fetcher.mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(
      repository.request(activity.id, 'sku/a', {
        token: 'secret',
        quantity: 1,
        shippingAddress: address,
      }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([{ status: 'SUCCESS', requestId: 'x' }, { status: 'QUEUED' }, null])(
    'rejects unconfirmed response %j',
    async response => {
      respond(response);
      await expect(
        repository.request(activity.id, 'sku/a', {
          token: 'secret',
          quantity: 1,
          shippingAddress: address,
        }),
      ).rejects.toThrow();
    },
  );
  it('rejects mismatched activity, malformed money and invalid stock', async () => {
    respond({ ...activity, id: 'wrong' });
    await expect(repository.get(activity.id)).rejects.toThrow();
    for (const patch of [
      { seckillPrice: 100 },
      { availableStock: -1 },
      { skuId: '' },
    ]) {
      respond([{ ...activity, skus: [{ ...activity.skus[0], ...patch }] }]);
      await expect(repository.list()).rejects.toThrow();
    }
  });
});
