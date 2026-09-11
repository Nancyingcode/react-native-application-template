import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { SkuCartStore } from '../src/modules/commerce/cart/SkuCartStore';
import {
  CartRepository,
  type ServerCartItem,
} from '../src/modules/commerce/cart/repository';
import type { HttpClient } from '../src/core/http';

const skuId = '11111111-1111-4111-8111-111111111111';
const itemId = '22222222-2222-4222-8222-222222222222';
const productId = '33333333-3333-4333-8333-333333333333';
const item: ServerCartItem = {
  id: itemId,
  skuId,
  productId,
  productName: 'Product',
  skuName: 'SKU',
  quantity: 2,
  selected: true,
  currentPrice: '1.0000',
  currency: 'CNY',
  available: 10,
  saleable: true,
  inStock: true,
  valid: true,
  invalidReason: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
}
async function setup(loggedIn = true) {
  const session = new SessionManager(new InMemorySessionStore());
  const login = (userId: string) =>
    session.setSession({
      userId,
      accessToken: userId,
      permissions: [],
      expiresAt: Date.now() + 60000,
    });
  if (loggedIn) {
    await login('A');
  }
  const request = jest.fn().mockImplementation(async (path: string) => ({
    data: path.includes('/skus/')
      ? { id: skuId, productId, name: 'SKU', status: 'ACTIVE' }
      : { userId: session.getSnapshot()?.userId, items: [{ ...item }] },
  }));
  const repository = new CartRepository({ request } as unknown as HttpClient);
  const store = new SkuCartStore(repository, session);
  return { session, login, request, repository, store };
}
it('uses server item IDs and disables retries on every mutation', async () => {
  const { repository, request } = await setup();
  await repository.add(skuId, 3);
  await repository.update(itemId, { quantity: 4, selected: false });
  await repository.remove(itemId);
  await repository.removeMany([itemId]);
  await repository.select([itemId], false);
  await repository.clear();
  expect(request.mock.calls.map(([path, options]) => [path, options])).toEqual([
    [
      '/api/v1/cart/items',
      { method: 'POST', body: { skuId, quantity: 3 }, retry: 0 },
    ],
    [
      `/api/v1/cart/items/${itemId}`,
      { method: 'PATCH', body: { quantity: 4, selected: false }, retry: 0 },
    ],
    [`/api/v1/cart/items/${itemId}`, { method: 'DELETE', retry: 0 }],
    [
      '/api/v1/cart/items',
      { method: 'DELETE', body: { itemIds: [itemId] }, retry: 0 },
    ],
    [
      '/api/v1/cart/items/select',
      {
        method: 'POST',
        body: { itemIds: [itemId], selected: false },
        retry: 0,
      },
    ],
    ['/api/v1/cart', { method: 'DELETE', retry: 0 }],
  ]);
});
it('serializes rapid quantity intentions and prevents late refresh overwrites', async () => {
  const { store, request } = await setup();
  const first = deferred<{
    data: { userId: string; items: ServerCartItem[] };
  }>();
  request.mockReturnValueOnce(first.promise);
  const one = store.updateItem(itemId, { quantity: 3 });
  const two = store.updateItem(itemId, { quantity: 4 });
  await Promise.resolve();
  expect(request).toHaveBeenCalledTimes(1);
  first.resolve({ data: { userId: 'A', items: [{ ...item, quantity: 3 }] } });
  await one;
  await two;
  expect(request.mock.calls[1][1].body.quantity).toBe(4);
});
it('refreshes after an uncertain additive request without replay', async () => {
  const { store, request } = await setup();
  request.mockRejectedValueOnce(new Error('timeout'));
  await expect(store.addItem(skuId, 1)).rejects.toThrow('timeout');
  expect(
    request.mock.calls.map(([path, options]) => [path, options.method]),
  ).toEqual([
    ['/api/v1/cart/items', 'POST'],
    ['/api/v1/cart', undefined],
  ]);
});
it('keeps guest items local until explicit merge and never repeats confirmed items', async () => {
  const { store, request, login } = await setup(false);
  await store.addItem(skuId, 2);
  expect(request).toHaveBeenCalledTimes(1);
  await login('A');
  expect(request).toHaveBeenCalledTimes(1);
  await store.confirmGuestMerge();
  await store.confirmGuestMerge();
  expect(
    request.mock.calls.filter(([, options]) => options.method === 'POST'),
  ).toHaveLength(1);
  expect(store.getSnapshot().guests).toHaveLength(0);
});
it('retains unknown merge progress across account switches and requires explicit resolution', async () => {
  const { store, repository, login } = await setup(false);
  await store.addItem(skuId, 2);
  await login('A');
  const add = jest
    .spyOn(repository, 'add')
    .mockRejectedValueOnce(new Error('timeout'));
  await expect(store.confirmGuestMerge()).rejects.toThrow();
  expect(store.getSnapshot().merge[0].status).toBe('unknown');
  await store.confirmGuestMerge();
  expect(add).toHaveBeenCalledTimes(1);
  await login('B');
  await store.confirmGuestMerge();
  expect(add).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().guests).toHaveLength(1);
  await login('A');
  await store.resolveUnknownMerge(skuId, 'retry');
  await store.confirmGuestMerge();
  expect(add).toHaveBeenCalledTimes(2);
});
it('rejects old queued writes and discards old account responses', async () => {
  const { store, request, login } = await setup();
  const response = deferred<{
    data: { userId: string; items: ServerCartItem[] };
  }>();
  request.mockReturnValueOnce(response.promise);
  const refresh = store.refresh();
  const queued = store.addItem(skuId, 1);
  const refreshed = refresh.catch(error => error);
  const rejected = queued.catch(error => error);
  await Promise.resolve();
  await login('B');
  response.resolve({ data: { userId: 'A', items: [item] } });
  expect((await refreshed).message).toContain('account changed');
  expect((await rejected).message).toContain('account changed');
  expect(request).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().items).toEqual([]);
});
it('freezes valid selected snapshots and invalidates them on logout, including same-user login', async () => {
  const { store, session, login, request } = await setup();
  request.mockResolvedValueOnce({
    data: {
      userId: 'A',
      items: [item, { ...item, id: productId, valid: false }],
    },
  });
  const snapshot = await store.captureCheckout();
  expect(snapshot.items).toEqual([
    { skuId, productId, cartItemId: itemId, quantity: 2 },
  ]);
  expect(Object.isFrozen(snapshot.items[0])).toBe(true);
  expect(Object.isFrozen(snapshot.items)).toBe(true);
  await session.signOut();
  await login('A');
  expect(store.getCheckoutSnapshot(snapshot.snapshotId)).toBeUndefined();
});
it('reconciles known orders only by refreshing, preserving unpurchased and added quantities', async () => {
  const { store, request } = await setup();
  const snapshot = await store.captureCheckout();
  request.mockResolvedValueOnce({
    data: { userId: 'A', items: [{ ...item, quantity: 5 }] },
  });
  await store.reconcileOrder({
    snapshotId: snapshot.snapshotId,
    orderId: productId,
  });
  expect(store.getSnapshot().items[0].quantity).toBe(5);
  expect(request.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it.each([0, 100, 1.5, NaN])(
  'rejects invalid quantity %s before sending',
  async quantity => {
    const { store, request } = await setup();
    await expect(store.addItem(skuId, quantity)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  },
);
it('captures quantity input before it waits in the request queue', async () => {
  const { store, request } = await setup();
  const patch = { quantity: 3 };
  const pending = store.updateItem(itemId, patch);
  patch.quantity = 9;
  await pending;
  expect(request.mock.calls[0][1].body).toEqual({ quantity: 3 });
});
