import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { ApiError } from '../src/core/http';
import { PaymentController } from '../src/modules/commerce/payments/PaymentController';
import type { PaymentResult } from '../src/modules/commerce/payments/contracts';

const payment: PaymentResult = {
  paymentId: 'payment-1',
  orderId: 'order-1',
  status: 'PENDING',
  amount: '199.0000',
  currency: 'CNY',
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function setup() {
  const session = new SessionManager(new InMemorySessionStore());
  const login = (userId = 'A') =>
    session.setSession({
      userId,
      accessToken: userId,
      expiresAt: Date.now() + 60000,
      permissions: [],
    });
  await login();
  const port = {
    create: jest.fn().mockResolvedValue(payment),
    get: jest.fn().mockResolvedValue(payment),
  };
  const newKey = jest.fn().mockReturnValue('operation-1');
  const controller = new PaymentController(port, session, newKey);
  const leave = controller.enter('order-1');
  return { controller, port, newKey, login, session, leave };
}

it('deduplicates clicks and preserves the same body/key after an uncertain result', async () => {
  const { controller, port, newKey } = await setup();
  const pending = deferred<PaymentResult>();
  port.create.mockReturnValueOnce(pending.promise);
  const first = controller.create('ALIPAY');
  await controller.create('WECHAT_PAY');
  expect(port.create).toHaveBeenCalledTimes(1);
  pending.reject(new Error('timeout'));
  await first;
  expect(controller.getSnapshot().phase).toBe('unknown');
  await controller.create('WECHAT_PAY');
  expect(port.create.mock.calls[1]).toEqual(port.create.mock.calls[0]);
  expect(newKey).toHaveBeenCalledTimes(1);
  await controller.create('ALIPAY');
  expect(port.create).toHaveBeenCalledTimes(2);
  controller.dispose();
});

it('drops late creation after leaving and retains its intent for explicit retry on reentry', async () => {
  const { controller, port, leave } = await setup();
  const pending = deferred<PaymentResult>();
  port.create.mockReturnValueOnce(pending.promise);
  const first = controller.create('ALIPAY');
  leave();
  pending.resolve({ ...payment, status: 'SUCCESS' });
  await first;
  controller.enter('order-1');
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'unknown',
    hasOperation: true,
  });
  expect(controller.getSnapshot().payment).toBeUndefined();
  await controller.create('ALIPAY');
  expect(port.create.mock.calls[1]).toEqual(port.create.mock.calls[0]);
  controller.dispose();
});

it('queries only paymentId, deduplicates queries and does not treat query failure as success', async () => {
  const { controller, port } = await setup();
  await controller.create('ALIPAY');
  const pending = deferred<PaymentResult>();
  port.get.mockReturnValueOnce(pending.promise);
  const first = controller.check();
  await controller.check();
  expect(port.get).toHaveBeenCalledTimes(1);
  expect(port.get).toHaveBeenCalledWith('payment-1');
  pending.reject(new Error('offline'));
  await first;
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'unknown',
    message: 'queryFailed',
  });
  port.get.mockResolvedValueOnce({ ...payment, status: 'SUCCESS' });
  await controller.check();
  expect(controller.getSnapshot().payment?.status).toBe('SUCCESS');
  controller.dispose();
});

it.each(['B', 'A'])(
  'clears account lifecycle state and rejects late results before login %s',
  async userId => {
    const { controller, port, session, login } = await setup();
    const pending = deferred<PaymentResult>();
    port.create.mockReturnValueOnce(pending.promise);
    const first = controller.create('ALIPAY');
    await session.signOut();
    await login(userId);
    pending.resolve({ ...payment, status: 'SUCCESS' });
    await first;
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'blocked',
      message: 'session',
      hasOperation: false,
    });
    expect(controller.getSnapshot().payment).toBeUndefined();
    await controller.create('ALIPAY');
    expect(port.create).toHaveBeenCalledTimes(1);
    controller.dispose();
  },
);

it.each([
  'ORDER_EXPIRED',
  'ORDER_ALREADY_PAID',
  'ORDER_ALREADY_CANCELLED',
  'IDEMPOTENCY_CONFLICT',
])('does not replace keys or replay blocked %s', async code => {
  const { controller, port, newKey } = await setup();
  port.create.mockRejectedValueOnce(new ApiError('conflict', 409, code));
  await controller.create('ALIPAY');
  await controller.create('WECHAT_PAY');
  controller.enter('order-1');
  await controller.create('ALIPAY');
  expect(controller.getSnapshot().phase).toBe('blocked');
  expect(port.create).toHaveBeenCalledTimes(1);
  expect(newKey).toHaveBeenCalledTimes(1);
  controller.dispose();
});

it('rejects mismatched order/user responses and late queries on another route', async () => {
  const { controller, port } = await setup();
  port.create.mockResolvedValueOnce({ ...payment, userId: 'B' });
  await controller.create('ALIPAY');
  expect(controller.getSnapshot().payment).toBeUndefined();
  await controller.create('ALIPAY');
  const pending = deferred<PaymentResult>();
  port.get.mockReturnValueOnce(pending.promise);
  const query = controller.check();
  controller.enter('order-2');
  pending.resolve({ ...payment, status: 'SUCCESS' });
  await query;
  expect(controller.getSnapshot()).toMatchObject({
    orderId: 'order-2',
    phase: 'idle',
  });
  expect(controller.getSnapshot().payment).toBeUndefined();
  controller.dispose();
});

it('does not invalidate a payment operation for a same-user token refresh', async () => {
  const { controller, port, login } = await setup();
  const pending = deferred<PaymentResult>();
  port.create.mockReturnValueOnce(pending.promise);
  const first = controller.create('ALIPAY');
  await login();
  pending.resolve(payment);
  await first;
  expect(controller.getSnapshot().phase).toBe('ready');
  controller.dispose();
});

it('clears forbidden query results and keeps them blocked on reentry', async () => {
  const { controller, port } = await setup();
  await controller.create('ALIPAY');
  port.get.mockRejectedValueOnce(
    new ApiError('not owned', 403, 'PAYMENT_NOT_OWNED'),
  );
  await controller.check();
  controller.enter('order-1');
  expect(controller.getSnapshot()).toMatchObject({
    phase: 'blocked',
    payment: undefined,
  });
  controller.dispose();
});
