import { CheckoutRepository } from '../src/modules/commerce/checkout/api';
import { validateShippingAddress } from '../src/modules/commerce/checkout/shippingAddress';
import type { HttpClient } from '../src/core/http';

const skuId = '11111111-1111-4111-8111-111111111111';
const couponId = '22222222-2222-4222-8222-222222222222';
const address = {
  recipient: ' 张三 ',
  phone: ' +86 123 ',
  province: ' 广东 ',
  city: ' 深圳 ',
  addressLine: ' 科技路 ',
  district: '  ',
};
const summary = {
  originalAmount: '12345678901234567890.1234',
  promotionDiscountAmount: '0',
  couponDiscountAmount: '1.00',
  shippingAmount: '2.50',
  shippingDiscountAmount: '0',
  discountAmount: '1',
  payableAmount: '12345678901234567891.6234',
};
function setup() {
  const request = jest.fn();
  return {
    request,
    repository: new CheckoutRepository({ request } as unknown as HttpClient),
  };
}
it('trims all address fields, omits optional blanks, and does not invent phone validation', () => {
  expect(validateShippingAddress(address)).toEqual({
    valid: true,
    value: {
      recipient: '张三',
      phone: '+86 123',
      province: '广东',
      city: '深圳',
      addressLine: '科技路',
    },
  });
  expect(
    validateShippingAddress({ ...address, phone: 'extension 12' }).valid,
  ).toBe(true);
});
it.each([
  ['recipient', 100],
  ['phone', 32],
  ['province', 100],
  ['city', 100],
  ['district', 100],
  ['addressLine', 300],
  ['postalCode', 20],
] as const)('validates %s length boundaries', (field, limit) => {
  expect(
    validateShippingAddress({ ...address, [field]: 'a'.repeat(limit) }).valid,
  ).toBe(true);
  expect(
    validateShippingAddress({ ...address, [field]: 'a'.repeat(limit + 1) })
      .valid,
  ).toBe(false);
});
it('returns localized required field errors', () => {
  expect(validateShippingAddress({}, () => 'Required')).toEqual({
    valid: false,
    errors: {
      recipient: 'Required',
      phone: 'Required',
      province: 'Required',
      city: 'Required',
      addressLine: 'Required',
    },
  });
});
it('sends only explicit SKU items and user coupon ID; preserves decimal strings', async () => {
  const { request, repository } = setup();
  request.mockResolvedValue({
    data: { ...summary, currency: 'SHOULD_NOT_INVENT', items: [] },
  });
  const input = {
    items: [{ skuId, quantity: 2, productId: 'not-a-sku' }],
    couponId,
    shippingAddress: address,
  };
  expect(await repository.preview(input)).toEqual(summary);
  expect(request).toHaveBeenCalledWith('/api/v1/pricing/preview', {
    method: 'POST',
    body: { items: [{ skuId, quantity: 2 }], couponId },
    authenticated: true,
  });
});
it('uses one header key, no automatic retries, no amount or data wrapper, and maps data.id', async () => {
  const { request, repository } = setup();
  request.mockResolvedValue({ data: { id: couponId } });
  expect(
    await repository.create(
      { items: [{ skuId, quantity: 1 }], shippingAddress: address },
      { idempotencyKey: 'checkout-test-001' },
    ),
  ).toEqual({ orderId: couponId });
  expect(request).toHaveBeenCalledWith('/api/v1/orders', {
    method: 'POST',
    body: {
      items: [{ skuId, quantity: 1 }],
      shippingAddress: {
        recipient: '张三',
        phone: '+86 123',
        province: '广东',
        city: '深圳',
        addressLine: '科技路',
      },
    },
    authenticated: true,
    retry: 0,
    headers: { 'Idempotency-Key': 'checkout-test-001' },
  });
});
it.each([0, 100, 1.5, NaN])(
  'rejects invalid quantity %s before HTTP',
  async quantity => {
    const { request, repository } = setup();
    await expect(
      repository.preview({ items: [{ skuId, quantity }] }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  },
);
it('rejects absent or duplicate SKU items, oversized lists, malformed IDs and idempotency keys', async () => {
  const { request, repository } = setup();
  for (const items of [
    [],
    Array(51).fill({ skuId, quantity: 1 }),
    [{ skuId: 'product-id', quantity: 1 }],
    [
      { skuId, quantity: 1 },
      { skuId, quantity: 2 },
    ],
  ]) {
    await expect(repository.preview({ items })).rejects.toThrow();
  }
  await expect(
    repository.create(
      { items: [{ skuId, quantity: 1 }], shippingAddress: address },
      { idempotencyKey: 'short' },
    ),
  ).rejects.toThrow();
  await expect(
    repository.preview({
      items: [{ skuId, quantity: 1 }],
      couponId: 'template-id',
    }),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
it.each([
  null,
  { ...summary, payableAmount: 12 },
  { ...summary, payableAmount: 'NaN' },
  { ...summary, payableAmount: '-1' },
])('rejects malformed pricing instead of zero fallback', async data => {
  const { request, repository } = setup();
  request.mockResolvedValue({ data });
  await expect(
    repository.preview({ items: [{ skuId, quantity: 1 }] }),
  ).rejects.toThrow();
});
