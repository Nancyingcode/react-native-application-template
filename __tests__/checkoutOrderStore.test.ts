import { CheckoutOrderStore } from '../src/modules/commerce/checkout/CheckoutOrderStore';
import type { SkuCartStore } from '../src/modules/commerce/cart/SkuCartStore';
const address = {
  recipient: 'A',
  phone: '123',
  province: 'P',
  city: 'C',
  addressLine: 'Road',
};
function setup() {
  let owner = { userId: 'A', generation: 1 };
  const snapshot = {
    snapshotId: 's',
    owner,
    items: [
      {
        skuId: '11111111-1111-4111-8111-111111111111',
        quantity: 2,
        productId: 'product',
        cartItemId: 'cart',
      },
    ],
  };
  let listener = () => {};
  const cart = {
    getSnapshot: () => ({ owner }),
    getCheckoutSnapshot: (id: string) => (id === 's' ? snapshot : undefined),
    subscribe: (callback: () => void) => {
      listener = callback;
      return () => {};
    },
    reconcileOrder: jest.fn(),
  };
  const checkout = { preview: jest.fn(), create: jest.fn() };
  return {
    store: new CheckoutOrderStore(checkout, cart as unknown as SkuCartStore),
    checkout,
    changeOwner: () => {
      owner = { userId: 'A', generation: 2 };
      listener();
    },
  };
}
it('keeps the same intent across leaving and returning, and blocks replacement after an unknown outcome', async () => {
  const { store, checkout } = setup();
  checkout.create.mockRejectedValue(new Error('timeout'));
  const operation = store.prepare('s', { shippingAddress: address });
  await expect(operation.submit()).rejects.toThrow('timeout');
  expect(() =>
    store.prepare('another-snapshot', { shippingAddress: address }),
  ).toThrow('changing snapshot');
  operation.deactivate();
  expect(store.prepare('s', { shippingAddress: address })).toBe(operation);
  expect(() =>
    store.prepare('s', { shippingAddress: { ...address, city: 'Other' } }),
  ).toThrow('Resolve existing');
  operation.activate();
  await expect(operation.submit()).rejects.toThrow('timeout');
  expect(checkout.create.mock.calls[0]).toEqual(checkout.create.mock.calls[1]);
  expect(checkout.create.mock.calls[0][0].items).toEqual([
    { skuId: '11111111-1111-4111-8111-111111111111', quantity: 2 },
  ]);
  store.dispose();
});
it('creates a new key for a changed unsent intent', () => {
  const { store } = setup();
  const first = store.prepare('s', { shippingAddress: address });
  const second = store.prepare('s', {
    shippingAddress: { ...address, recipient: 'B' },
  });
  expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  store.dispose();
});
it('rejects missing, old-account snapshots and disposed stores', () => {
  const { store, changeOwner } = setup();
  expect(() => store.prepare('missing', { shippingAddress: address })).toThrow(
    'snapshot expired',
  );
  const first = store.prepare('s', { shippingAddress: address });
  changeOwner();
  expect(() => store.prepare('s', { shippingAddress: address })).toThrow(
    'snapshot expired',
  );
  expect(() => first.activate()).toThrow('owner expired');
  store.dispose();
  expect(() => store.prepare('s', { shippingAddress: address })).toThrow(
    'disposed',
  );
});
