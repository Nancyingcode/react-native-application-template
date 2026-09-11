import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { HttpClient } from '../src/core/http';
import {
  PaymentsRepository,
  readPayment,
} from '../src/modules/commerce/payments/api';
import { completeDevelopmentPayment } from '../src/modules/commerce/payments/testing/developmentPayment';

const dto = {
  id: 'payment/1',
  orderId: 'order/1',
  userId: 'A',
  paymentNo: 'P/1',
  provider: 'ALIPAY',
  status: 'PENDING',
  amount: '199.0000',
  currency: 'CNY',
  expiredAt: null,
};
async function setup() {
  const session = new SessionManager(new InMemorySessionStore());
  await session.setSession({
    userId: 'A',
    accessToken: 'test-access',
    expiresAt: Date.now() + 60000,
    permissions: [],
  });
  const fetcher = jest.fn();
  const http = new HttpClient({
    baseUrl: 'https://payments.test',
    timeoutMs: 5000,
    session,
    cache: new MemoryCache(),
    logger: {
      log() {},
      child() {
        return this;
      },
    },
    fetcher,
  });
  const repository = new PaymentsRepository(http);
  const respond = (data: unknown, status = 200) =>
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ data }), { status }),
    );
  return { repository, fetcher, respond, http };
}

it('uses frozen paths, body and a single header, unwraps once and preserves decimal precision', async () => {
  const { repository, fetcher, respond } = await setup();
  respond({
    payment: dto,
    paymentParameters: {
      provider: 'ALIPAY',
      paymentNo: 'P/1',
      expiresAt: null,
    },
  });
  const result = await repository.create(
    { orderId: 'order/1', provider: 'ALIPAY' },
    { idempotencyKey: 'payment-operation' },
  );
  expect(result).toMatchObject({
    paymentId: 'payment/1',
    orderId: 'order/1',
    amount: '199.0000',
    currency: 'CNY',
  });
  const [url, request] = fetcher.mock.calls[0];
  expect(url).toBe('https://payments.test/api/v1/orders/order%2F1/payments');
  expect(JSON.parse(request.body)).toEqual({ provider: 'ALIPAY' });
  expect(request.headers.get('Idempotency-Key')).toBe('payment-operation');
  expect(request.headers.get('Authorization')).toBe('Bearer test-access');
  respond(dto);
  expect(await repository.get(result.paymentId)).toEqual(result);
  expect(fetcher.mock.calls[1][0]).toBe(
    'https://payments.test/api/v1/payments/payment%2F1',
  );
});

it('supports server default MOCK only when provider is deliberately omitted by an API caller', async () => {
  const { repository, fetcher, respond } = await setup();
  respond({ payment: { ...dto, provider: 'MOCK' } });
  await repository.create(
    { orderId: 'order/1' },
    { idempotencyKey: 'operation-1' },
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({});
});

it.each(['network', 'server'])(
  'never auto-replays a creation on %s failure',
  async failure => {
    const { repository, fetcher } = await setup();
    if (failure === 'network') {
      fetcher.mockRejectedValue(new Error('offline'));
    } else {
      fetcher.mockResolvedValue(new Response('{}', { status: 503 }));
    }
    await expect(
      repository.create(
        { orderId: 'order/1', provider: 'ALIPAY' },
        { idempotencyKey: 'operation-1' },
      ),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it.each(['short', 'with space in key', 'a'.repeat(129)])(
  'rejects invalid operation key %s before HTTP',
  async idempotencyKey => {
    const { repository, fetcher } = await setup();
    await expect(
      repository.create({ orderId: 'order/1' }, { idempotencyKey }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it('rejects wrong response identity, absent data, invalid decimals and provider mismatch', async () => {
  const { repository, respond } = await setup();
  respond({ ...dto, id: 'another-payment' });
  await expect(repository.get('payment/1')).rejects.toThrow(
    'identifier mismatch',
  );
  respond({ payment: { ...dto, orderId: 'other-order' } });
  await expect(
    repository.create(
      { orderId: 'order/1', provider: 'ALIPAY' },
      { idempotencyKey: 'operation-1' },
    ),
  ).rejects.toThrow('different order');
  respond({ payment: { ...dto, provider: 'MOCK' } });
  await expect(
    repository.create(
      { orderId: 'order/1', provider: 'ALIPAY' },
      { idempotencyKey: 'operation-1' },
    ),
  ).rejects.toThrow('provider mismatch');
  respond(undefined);
  await expect(repository.get('payment/1')).rejects.toThrow();
  for (const amount of [199, 'NaN', '1e2', '-1', '']) {
    expect(() => readPayment({ ...dto, amount })).toThrow();
  }
  expect(
    readPayment({
      ...dto,
      amount: '9999999999999999999999.0001',
      status: 'FUTURE_STATUS',
    }),
  ).toMatchObject({
    amount: '9999999999999999999999.0001',
    status: 'FUTURE_STATUS',
  });
});

it('development success uses paymentNo, no callback or dynamic URL, and exposes compensation separately', async () => {
  const { http, fetcher, respond } = await setup();
  const payment = readPayment({ ...dto, provider: 'MOCK' });
  respond({
    payment: { ...dto, provider: 'MOCK', status: 'SUCCESS' },
    outcome: 'COMPENSATION_REQUIRED',
  });
  const result = await completeDevelopmentPayment(http, payment, {
    environment: 'development',
    confirmed: true,
  });
  expect(result.outcome).toBe('COMPENSATION_REQUIRED');
  expect(fetcher.mock.calls[0][0]).toBe(
    'https://payments.test/api/v1/mock-payments/P%2F1/success',
  );
  expect(fetcher.mock.calls[0][1].headers.has('Authorization')).toBe(false);
  expect(fetcher.mock.calls[0][1].method).toBe('POST');
});

it('blocks production, staging, missing confirmation and non-MOCK development completion', async () => {
  const { http, fetcher } = await setup();
  for (const environment of ['production', 'staging'] as const) {
    await expect(
      completeDevelopmentPayment(
        http,
        readPayment({ ...dto, provider: 'MOCK' }),
        { environment, confirmed: true },
      ),
    ).rejects.toThrow();
  }
  await expect(
    completeDevelopmentPayment(
      http,
      readPayment({ ...dto, provider: 'MOCK' }),
      { environment: 'development', confirmed: false },
    ),
  ).rejects.toThrow();
  await expect(
    completeDevelopmentPayment(http, readPayment(dto), {
      environment: 'development',
      confirmed: true,
    }),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

it('does not automatically retry mock success after uncertain transport failure', async () => {
  const { http, fetcher } = await setup();
  fetcher.mockRejectedValue(new Error('timeout'));
  await expect(
    completeDevelopmentPayment(
      http,
      readPayment({ ...dto, provider: 'MOCK' }),
      { environment: 'development', confirmed: true },
    ),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('runs the development create → mock notification → authoritative GET chain with an HTTP test double', async () => {
  const { repository, http, fetcher, respond } = await setup();
  const mock = { ...dto, provider: 'MOCK' };
  respond({ payment: mock });
  const created = await repository.create(
    { orderId: mock.orderId, provider: 'MOCK' },
    { idempotencyKey: 'development-operation' },
  );
  respond({ payment: { ...mock, status: 'SUCCESS' }, outcome: 'PAID' });
  const completion = await completeDevelopmentPayment(http, created, {
    environment: 'development',
    confirmed: true,
  });
  expect(completion.outcome).toBe('PAID');
  respond({ ...mock, status: 'SUCCESS' });
  expect((await repository.get(created.paymentId)).status).toBe('SUCCESS');
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    'https://payments.test/api/v1/orders/order%2F1/payments',
    'https://payments.test/api/v1/mock-payments/P%2F1/success',
    'https://payments.test/api/v1/payments/payment%2F1',
  ]);
});
