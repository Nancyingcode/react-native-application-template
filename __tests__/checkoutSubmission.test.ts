import { OrderSubmission } from '../src/modules/commerce/checkout/OrderSubmission';
import { ApiError } from '../src/core/http';
import type { CartCheckoutPort } from '../src/modules/commerce/cart/contracts';
const input = {
  items: [{ skuId: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
  shippingAddress: {
    recipient: 'A',
    phone: '123',
    province: 'P',
    city: 'C',
    addressLine: 'Road',
  },
};
function setup() {
  let owner = { userId: 'A', generation: 1 };
  const checkout = { preview: jest.fn(), create: jest.fn() };
  const cart = { reconcileOrder: jest.fn().mockResolvedValue(undefined) };
  const operation = new OrderSubmission(
    checkout,
    input,
    owner,
    () => owner,
    cart as unknown as CartCheckoutPort,
    'snapshot',
    'checkout-fixed-key',
  );
  return {
    checkout,
    cart,
    operation,
    changeOwner: () => {
      owner = { userId: 'A', generation: 2 };
    },
  };
}
it('shares a double tap and retries uncertain results with exactly the same body and key', async () => {
  const { checkout, operation } = setup();
  checkout.create
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValue({ orderId: 'real-order' });
  const first = operation.submit();
  expect(operation.submit()).toBe(first);
  await expect(first).rejects.toThrow('timeout');
  expect(operation.getStatus()).toBe('unknown');
  expect(await operation.submit()).toEqual({ orderId: 'real-order' });
  expect(checkout.create.mock.calls[0]).toEqual(checkout.create.mock.calls[1]);
  await operation.submit();
  expect(checkout.create).toHaveBeenCalledTimes(2);
});
it.each(['IDEMPOTENCY_CONFLICT', 'INSUFFICIENT_STOCK', 'COUPON_NOT_AVAILABLE'])(
  'blocks automatic replay for %s',
  async code => {
    const { checkout, operation } = setup();
    checkout.create.mockRejectedValue(new ApiError('Rejected', 409, code));
    await expect(operation.submit()).rejects.toThrow();
    await expect(operation.submit()).rejects.toThrow('requires review');
    expect(checkout.create).toHaveBeenCalledTimes(1);
  },
);
it('allows explicit same-key retry while the server reports processing', async () => {
  const { checkout, operation } = setup();
  checkout.create.mockRejectedValue(
    new ApiError('Processing', 409, 'IDEMPOTENCY_IN_PROGRESS'),
  );
  await expect(operation.submit()).rejects.toThrow();
  await expect(operation.submit()).rejects.toThrow();
  expect(checkout.create.mock.calls[0]).toEqual(checkout.create.mock.calls[1]);
});
it('retains order after leaving without reconciling, and recovers once reactivated', async () => {
  const { checkout, operation, cart } = setup();
  let finish!: (value: { orderId: string }) => void;
  checkout.create.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const pending = operation.submit();
  operation.deactivate();
  finish({ orderId: 'order' });
  await pending;
  await operation.reconcile();
  expect(cart.reconcileOrder).not.toHaveBeenCalled();
  operation.activate();
  await operation.reconcile();
  await operation.reconcile();
  expect(cart.reconcileOrder).toHaveBeenCalledTimes(1);
  expect(cart.reconcileOrder).toHaveBeenCalledWith({
    orderId: 'order',
    snapshotId: 'snapshot',
  });
});
it('rejects late results and access after the same user logs out and back in', async () => {
  const { checkout, operation, changeOwner, cart } = setup();
  let finish!: (value: { orderId: string }) => void;
  checkout.create.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  const pending = operation.submit();
  changeOwner();
  finish({ orderId: 'order' });
  await expect(pending).rejects.toThrow('owner expired');
  expect(() => operation.getResult()).toThrow('owner expired');
  expect(() => operation.submit()).toThrow('owner expired');
  expect(cart.reconcileOrder).not.toHaveBeenCalled();
});
it('does not lose known order when cart reconciliation fails', async () => {
  const { checkout, operation, cart } = setup();
  checkout.create.mockResolvedValue({ orderId: 'order' });
  cart.reconcileOrder.mockRejectedValueOnce(new Error('offline'));
  await operation.submit();
  await expect(operation.reconcile()).rejects.toThrow('offline');
  expect(operation.getResult()).toEqual({ orderId: 'order' });
  await operation.reconcile();
  expect(checkout.create).toHaveBeenCalledTimes(1);
});

it('hands only the authoritative order ID to payment while the owner and page remain active', async () => {
  const { checkout, operation, changeOwner } = setup();
  const navigate = jest.fn();
  operation.continueToPayment(navigate);
  expect(navigate).not.toHaveBeenCalled();
  checkout.create.mockResolvedValue({ orderId: 'server-order' });
  await operation.submit();
  operation.deactivate();
  operation.continueToPayment(navigate);
  expect(navigate).not.toHaveBeenCalled();
  operation.activate();
  operation.continueToPayment(navigate);
  expect(navigate).toHaveBeenCalledWith('CommercePayment', {
    orderId: 'server-order',
  });
  changeOwner();
  expect(() => operation.continueToPayment(navigate)).toThrow('owner expired');
  expect(navigate).toHaveBeenCalledTimes(1);
});
