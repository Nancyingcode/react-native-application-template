import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { HttpClient } from '../src/core/http';
import { ConsoleLogger } from '../src/core/logger';
import { CouponsRepository } from '../src/modules/commerce/coupons/repository';

const coupon = {
  id: 'user-coupon',
  couponTemplateId: 'template/id',
  name: 'Coupon',
  type: 'CASH',
  status: 'AVAILABLE',
  validFrom: '2026-01-01T00:00:00Z',
  validUntil: '2027-01-01T00:00:00Z',
  orderId: null,
  unavailableReason: null,
};

async function setup() {
  const session = new SessionManager(new InMemorySessionStore());
  await session.setSession({
    userId: 'A',
    accessToken: 'a',
    expiresAt: Date.now() + 60000,
    permissions: [],
  });
  const fetcher = jest
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: coupon }), { status: 201 }),
    );
  const logger = new ConsoleLogger({ scope: 'test' });
  jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  const http = new HttpClient({
    baseUrl: 'https://example.test',
    timeoutMs: 1000,
    session,
    fetcher,
    cache: new MemoryCache(),
    logger,
  });
  return { repository: new CouponsRepository(http), fetcher, session };
}

it('sends an encoded template ID and one header with no invented body', async () => {
  const { repository, fetcher } = await setup();
  expect(await repository.claim('template/id', 'stable-key')).toEqual(coupon);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe('https://example.test/api/v1/coupons/template%2Fid/claim');
  expect(options.method).toBe('POST');
  expect(options.body).toBeUndefined();
  expect(options.headers.get('Idempotency-Key')).toBe('stable-key');
  expect(options.headers.get('Authorization')).toBe('Bearer a');
});

it.each([503, 409, 400])(
  'does not retry a claim after HTTP %s and preserves API details',
  async status => {
    const { repository, fetcher } = await setup();
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({ message: 'Denied', code: 'CLAIM_DENIED' }),
        { status, headers: { 'X-Request-Id': 'request-1' } },
      ),
    );
    await expect(
      repository.claim('template', 'stable-key'),
    ).rejects.toMatchObject({
      status,
      code: 'CLAIM_DENIED',
      requestId: 'request-1',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it('does not retry network failures, and rejects anonymous claims', async () => {
  const { repository, fetcher, session } = await setup();
  fetcher.mockRejectedValue(new TypeError('offline'));
  await expect(repository.claim('template', 'stable-key')).rejects.toThrow(
    'offline',
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  await session.signOut();
  await expect(repository.claim('template', 'stable-key')).rejects.toThrow(
    'valid session',
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('unwraps lists once, sends server filters, and never caches authenticated coupons', async () => {
  const request = jest.fn().mockResolvedValue({ data: [coupon] });
  const repository = new CouponsRepository({ request });
  expect(await repository.my('USED')).toEqual([coupon]);
  expect(request).toHaveBeenLastCalledWith('/api/v1/coupons/my?status=USED');
  await repository.my();
  expect(request).toHaveBeenLastCalledWith('/api/v1/coupons/my');
  await repository.available();
  expect(request).toHaveBeenLastCalledWith('/api/v1/coupons/available');
});

it.each([{}, { data: null }, { data: [{}] }, { data: [{ ...coupon, id: 1 }] }])(
  'rejects malformed coupon data %j',
  async response => {
    const repository = new CouponsRepository({
      request: jest.fn().mockResolvedValue(response),
    });
    await expect(repository.available()).rejects.toThrow('Invalid');
  },
);

it('preserves unknown status/type without inventing coupon amounts', async () => {
  const response = { ...coupon, type: 'NEW_TYPE', status: 'NEW_STATUS' };
  const repository = new CouponsRepository({
    request: jest.fn().mockResolvedValue({ data: [response] }),
  });
  expect(await repository.available()).toEqual([response]);
});

it('keeps the claim header and body unchanged through the shared 401 refresh', async () => {
  const { repository, fetcher, session } = await setup();
  await session.setSession({
    userId: 'A',
    accessToken: 'old',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 60000,
    permissions: [],
  });
  session.setRefresher(async current => ({ ...current, accessToken: 'new' }));
  fetcher.mockResolvedValueOnce(new Response('{}', { status: 401 }));
  expect(await repository.claim('template/id', 'same-operation')).toEqual(
    coupon,
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
  const headers = fetcher.mock.calls.map(([, options]) =>
    options.headers.get('Idempotency-Key'),
  );
  expect(headers).toEqual(['same-operation', 'same-operation']);
  expect(
    fetcher.mock.calls.every(([, options]) => options.body === undefined),
  ).toBe(true);
});
