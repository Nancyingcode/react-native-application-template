import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { ApiError } from '../src/core/http';
import {
  AfterSalesStore,
  type ApplicationIntent,
} from '../src/modules/commerce/after-sales/AfterSalesStore';

const entry = {
  orderId: 'order-1',
  orderItemId: '11111111-1111-4111-8111-111111111111',
  quantity: 2,
};
const order = {
  orderId: entry.orderId,
  status: 'PAID',
  items: [
    {
      orderItemId: entry.orderItemId,
      skuId: 'sku',
      productId: 'product',
      quantity: 3,
    },
  ],
};
const intent = (): ApplicationIntent => ({
  flow: 'refund',
  input: {
    orderId: entry.orderId,
    items: [{ orderItemId: entry.orderItemId, quantity: entry.quantity }],
    reason: 'damaged',
    type: 'RETURN_AND_REFUND',
  },
});
const afterSale = (): ApplicationIntent => ({
  flow: 'afterSale',
  input: { ...intent().input, type: 'RETURN_REFUND' },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}
describe('after-sales ownership and operation state', () => {
  let store: AfterSalesStore;
  let session: SessionManager;
  const port = { requestRefund: jest.fn(), requestAfterSale: jest.fn() };
  const orders = { getForAfterSale: jest.fn() };
  const newKey = jest.fn();
  async function login(userId = 'user-a') {
    await session.setSession({
      userId,
      accessToken: userId,
      permissions: [],
      expiresAt: Date.now() + 60000,
    });
  }
  async function open() {
    const leave = store.open(entry);
    await Promise.resolve();
    await Promise.resolve();
    return leave;
  }
  beforeEach(async () => {
    session = new SessionManager(new InMemorySessionStore());
    await login();
    port.requestRefund
      .mockReset()
      .mockResolvedValue({ refundId: 'refund', status: 'PENDING' });
    port.requestAfterSale
      .mockReset()
      .mockResolvedValue({ afterSaleId: 'after-sale', status: 'REQUESTED' });
    orders.getForAfterSale.mockReset().mockResolvedValue(order);
    newKey.mockReset().mockReturnValue('key-123456');
    store = new AfterSalesStore(port, orders, session, newKey);
  });
  afterEach(() => store.dispose());
  it('rechecks authoritative membership before one request, ignores rapid double taps', async () => {
    await open();
    await Promise.all([store.submit(intent()), store.submit(intent())]);
    expect(orders.getForAfterSale).toHaveBeenCalledTimes(2);
    expect(port.requestRefund).toHaveBeenCalledTimes(1);
    expect(port.requestAfterSale).not.toHaveBeenCalled();
    expect(store.getSnapshot().result).toEqual({
      id: 'refund',
      status: 'PENDING',
    });
  });
  it('does not submit when authoritative quantities change at confirmation', async () => {
    await open();
    orders.getForAfterSale.mockResolvedValue({
      ...order,
      items: [{ ...order.items[0], quantity: 1 }],
    });
    await store.submit(intent());
    expect(port.requestRefund).not.toHaveBeenCalled();
    expect(store.getSnapshot().error).toBe('invalid');
  });
  it.each([
    { ...order, orderId: 'other' },
    { ...order, items: [] },
    { ...order, items: [order.items[0], order.items[0]] },
  ])('rejects an unrelated or ambiguous order item', async invalidOrder => {
    orders.getForAfterSale.mockResolvedValue(invalidOrder);
    await open();
    expect(store.getSnapshot().phase).toBe('error');
  });
  it('keeps identical body and key after timeout, blocks another flow or quantity', async () => {
    await open();
    port.requestRefund.mockRejectedValueOnce(new Error('timeout'));
    const original = intent();
    await store.submit(original);
    original.input.reason = 'mutated';
    expect(store.getSnapshot().phase).toBe('unknown');
    await store.submit(afterSale());
    store.open({ ...entry, quantity: 1 });
    await store.retryRefund();
    expect(port.requestRefund.mock.calls[0]).toEqual(
      port.requestRefund.mock.calls[1],
    );
    expect(port.requestRefund.mock.calls[1][0].reason).toBe('damaged');
    expect(newKey).toHaveBeenCalledTimes(1);
    expect(port.requestAfterSale).not.toHaveBeenCalled();
  });
  it('never retries an uncertain after-sale or switches to refund', async () => {
    await open();
    port.requestAfterSale.mockRejectedValue(new Error('timeout'));
    await store.submit(afterSale());
    await store.retryRefund();
    await store.submit(intent());
    await open();
    expect(store.getSnapshot().phase).toBe('unknown');
    expect(port.requestAfterSale).toHaveBeenCalledTimes(1);
    expect(port.requestRefund).not.toHaveBeenCalled();
  });
  it('does not replace keys on conflict', async () => {
    await open();
    port.requestRefund.mockRejectedValue(
      new ApiError('processing', 409, 'PROCESSING', 'trace'),
    );
    await store.submit(intent());
    await store.retryRefund();
    expect(store.getSnapshot()).toMatchObject({
      phase: 'conflict',
      requestId: 'trace',
    });
    expect(port.requestRefund).toHaveBeenCalledTimes(1);
  });
  it('does not treat a rejected retry as proof that the earlier uncertain request failed', async () => {
    await open();
    port.requestRefund.mockRejectedValueOnce(new Error('timeout'));
    await store.submit(intent());
    port.requestRefund.mockRejectedValueOnce(
      new ApiError('invalid now', 400, 'INVALID'),
    );
    await store.retryRefund();
    expect(store.getSnapshot().phase).toBe('unknown');
    await store.reload();
    await store.submit(afterSale());
    expect(port.requestAfterSale).not.toHaveBeenCalled();
  });
  it('invalidates an in-flight submission when another page opens without cleanup', async () => {
    await open();
    const pending = deferred<{ refundId: string; status: string }>();
    port.requestRefund.mockReturnValue(pending.promise);
    const submission = store.submit(intent());
    await Promise.resolve();
    await Promise.resolve();
    store.open({ ...entry, quantity: 1 });
    pending.resolve({ refundId: 'late', status: 'SUCCESS' });
    await submission;
    expect(store.getSnapshot().phase).toBe('unknown');
    expect(store.getSnapshot().entry?.quantity).toBe(2);
  });
  it('drops a late order read after leaving', async () => {
    const pending = deferred<typeof order>();
    orders.getForAfterSale.mockReturnValue(pending.promise);
    const leave = store.open(entry);
    leave();
    pending.resolve(order);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getSnapshot().phase).not.toBe('ready');
  });
  it('does not send after leaving during confirmation recheck', async () => {
    const leave = await open();
    const pending = deferred<typeof order>();
    orders.getForAfterSale.mockReturnValue(pending.promise);
    const submission = store.submit(intent());
    leave();
    pending.resolve(order);
    await submission;
    expect(port.requestRefund).not.toHaveBeenCalled();
  });
  it('retains unknown on leaving while sending and ignores late success', async () => {
    const leave = await open();
    const pending = deferred<{ refundId: string; status: string }>();
    port.requestRefund.mockReturnValue(pending.promise);
    const submission = store.submit(intent());
    await Promise.resolve();
    await Promise.resolve();
    leave();
    pending.resolve({ refundId: 'late', status: 'SUCCESS' });
    await submission;
    await open();
    expect(store.getSnapshot().phase).toBe('unknown');
    expect(store.getSnapshot().result).toBeUndefined();
  });
  it('clears data and ignores late results across A → B → A account lifecycles', async () => {
    await open();
    const pending = deferred<{ refundId: string; status: string }>();
    port.requestRefund.mockReturnValue(pending.promise);
    const submission = store.submit(intent());
    await Promise.resolve();
    await Promise.resolve();
    await login('user-b');
    await login('user-a');
    pending.resolve({ refundId: 'private-a', status: 'SUCCESS' });
    await submission;
    expect(store.getSnapshot()).toEqual({ phase: 'signedOut' });
  });
  it('retains completed application across page remounts', async () => {
    const leave = await open();
    await store.submit(intent());
    leave();
    await open();
    await store.submit(afterSale());
    expect(store.getSnapshot().phase).toBe('success');
    expect(port.requestAfterSale).not.toHaveBeenCalled();
  });
});
