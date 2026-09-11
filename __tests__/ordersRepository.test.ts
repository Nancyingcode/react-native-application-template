import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { ApiError } from '../src/core/http';
import { OrdersRepository } from '../src/modules/commerce/orders/repository';
import orderFixture from './ordersFixture.json';

export async function setup() {
  const session = new SessionManager(new InMemorySessionStore());
  await session.setSession({
    userId: 'user-a',
    accessToken: 'test',
    expiresAt: Date.now() + 60000,
    permissions: [],
  });
  const request = jest.fn().mockResolvedValue({ data: orderFixture });
  const repository = new OrdersRepository({ request }, session);
  return { session, request, repository };
}
it('keeps paging filters separate from opaque cursor, validates inputs and never caches', async () => {
  const { repository, request } = await setup();
  request.mockResolvedValueOnce({
    data: { items: [], page: 2, pageSize: 30, total: 0 },
  });
  await repository.list({ status: 'PAID', orderNo: 'a&b' }, 2, 30);
  expect(request).toHaveBeenLastCalledWith(
    '/api/v1/orders?page=2&pageSize=30&status=PAID&orderNo=a%26b',
    undefined,
  );
  request.mockResolvedValueOnce({ data: { items: [], nextCursor: null } });
  await repository.listCursor('a+/=', 10);
  expect(request).toHaveBeenLastCalledWith(
    '/api/v1/orders/cursor?after=a%2B%2F%3D&limit=10',
    undefined,
  );
  await expect(repository.list({}, 0)).rejects.toThrow();
  await expect(repository.list({}, 1, 101)).rejects.toThrow();
  await expect(repository.list({ createdFrom: 'bad' })).rejects.toThrow();
  await expect(repository.list({ orderNo: 'x'.repeat(41) })).rejects.toThrow();
  repository.dispose();
});
it('reads authoritative item identity and preserves decimal strings', async () => {
  const { repository, request } = await setup();
  expect((await repository.get('order/1')).payableAmount).toBe('378.0000');
  expect(await repository.getForAfterSale('order/1')).toEqual({
    orderId: 'order/1',
    status: 'PENDING_PAYMENT',
    items: [
      {
        orderItemId: 'id',
        productId: 'productId',
        skuId: 'skuId',
        quantity: 1,
      },
    ],
  });
  expect(request).toHaveBeenLastCalledWith(
    '/api/v1/orders/order%2F1',
    undefined,
  );
  request.mockResolvedValueOnce({
    data: {
      ...orderFixture,
      items: [{ ...orderFixture.items[0], quantity: 1.5 }],
    },
  });
  await expect(repository.getForAfterSale('order/1')).rejects.toThrow(
    'Invalid order item',
  );
  repository.dispose();
});
it('sends bodyless mutations once and keeps unknown results blocked across consumers', async () => {
  const { repository, request } = await setup();
  await repository.cancel('order/1', { idempotencyKey: 'operation-123' });
  expect(request).toHaveBeenLastCalledWith('/api/v1/orders/order%2F1/cancel', {
    method: 'POST',
    retry: 0,
    headers: { 'Idempotency-Key': 'operation-123' },
  });
  request.mockRejectedValueOnce(new Error('timeout'));
  await expect(repository.confirmReceipt('order/1')).rejects.toThrow('timeout');
  expect(request).toHaveBeenLastCalledWith(
    '/api/v1/orders/order%2F1/confirm-receipt',
    { method: 'POST', retry: 0 },
  );
  await expect(repository.confirmReceipt('order/1')).rejects.toThrow(
    'reconciliation',
  );
  expect(request).toHaveBeenCalledTimes(2);
  request.mockResolvedValueOnce({
    data: { ...orderFixture, status: 'COMPLETED' },
  });
  await repository.get('order/1');
  expect(repository.isActionBlocked('order/1')).toBe(false);
  repository.dispose();
});
it('propagates conflicts and rejects late responses after logout and same-account login', async () => {
  const { repository, request, session } = await setup();
  request.mockRejectedValueOnce(
    new ApiError('paid', 409, 'ORDER_ALREADY_PAID'),
  );
  await expect(
    repository.cancel('order/1', { idempotencyKey: 'operation-123' }),
  ).rejects.toMatchObject({ code: 'ORDER_ALREADY_PAID' });
  let resolve!: (value: unknown) => void;
  request.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  const pending = repository.get('order/1');
  await session.signOut();
  await session.setSession({
    userId: 'user-a',
    accessToken: 'new',
    permissions: [],
    expiresAt: Date.now() + 60000,
  });
  resolve({ data: orderFixture });
  await expect(pending).rejects.toThrow('valid session');
  repository.dispose();
});
