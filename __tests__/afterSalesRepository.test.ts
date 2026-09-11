import { AfterSalesRepository } from '../src/modules/commerce/after-sales/repository';
import { parseAfterSaleEntry } from '../src/modules/commerce/after-sales/validation';

const orderItemId = '11111111-1111-4111-8111-111111111111';
const input = {
  orderId: 'order/a',
  reason: ' damaged ',
  items: [{ orderItemId, quantity: 2 }],
};
describe('after-sales frozen Swagger requests', () => {
  const request = jest.fn();
  const repository = new AfterSalesRepository({ request });
  beforeEach(() =>
    request.mockReset().mockResolvedValue({
      data: {
        id: 'application',
        orderId: input.orderId,
        status: 'NEW_UNKNOWN_STATUS',
      },
    }),
  );

  it('uses a single refund idempotency header, raw DTO, retry zero, encoded path', async () => {
    expect(
      await repository.requestRefund(input, {
        idempotencyKey: 'refund-key-123',
      }),
    ).toEqual({ refundId: 'application', status: 'NEW_UNKNOWN_STATUS' });
    expect(request).toHaveBeenCalledWith('/api/v1/orders/order%2Fa/refunds', {
      method: 'POST',
      retry: 0,
      headers: { 'Idempotency-Key': 'refund-key-123' },
      body: { items: input.items, reason: input.reason },
    });
  });
  it('uses the distinct after-sale enum without claiming idempotency', async () => {
    expect(
      await repository.requestAfterSale({
        ...input,
        type: 'RETURN_REFUND',
        description: 'details',
      }),
    ).toEqual({ afterSaleId: 'application', status: 'NEW_UNKNOWN_STATUS' });
    expect(request).toHaveBeenCalledWith(
      '/api/v1/orders/order%2Fa/after-sales',
      {
        method: 'POST',
        retry: 0,
        body: {
          items: input.items,
          reason: input.reason,
          type: 'RETURN_REFUND',
          description: 'details',
        },
      },
    );
  });
  it.each(['RETURN_REFUND', 'EXCHANGE'])(
    'rejects %s for refund at runtime',
    async type => {
      await expect(
        repository.requestRefund(
          { ...input, type } as Parameters<typeof repository.requestRefund>[0],
          { idempotencyKey: 'refund-key-123' },
        ),
      ).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );
  it.each(['RETURN_AND_REFUND', 'EXCHANGE'])(
    'rejects %s for after-sale at runtime',
    async type => {
      await expect(
        repository.requestAfterSale({ ...input, type } as Parameters<
          typeof repository.requestAfterSale
        >[0]),
      ).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );
  it.each([0, -1, 1.5, 1000, NaN])(
    'rejects invalid refund quantity %s',
    async quantity => {
      await expect(
        repository.requestRefund(
          { ...input, items: [{ orderItemId, quantity }] },
          { idempotencyKey: 'refund-key-123' },
        ),
      ).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );
  it('validates nonempty reason, item identity, duplicates and key', async () => {
    for (const invalid of [
      { ...input, reason: ' ' },
      { ...input, items: [] },
      { ...input, items: [...input.items, ...input.items] },
      { ...input, items: [{ orderItemId: 'sku-id', quantity: 1 }] },
    ]) {
      await expect(
        repository.requestRefund(invalid, { idempotencyKey: 'refund-key-123' }),
      ).rejects.toThrow();
    }
    await expect(
      repository.requestRefund(input, { idempotencyKey: 'bad\nkey' }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    { id: '', orderId: input.orderId, status: 'PENDING' },
    { id: 'r', orderId: 'other', status: 'PENDING' },
  ])('rejects malformed or mismatched success data', async data => {
    request.mockResolvedValue({ data });
    await expect(
      repository.requestRefund(input, { idempotencyKey: 'refund-key-123' }),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(['0', '-1', '1.5', '1e2', '01', '', 'Infinity', '9007199254740992'])(
    'rejects route quantity %s',
    quantity => {
      expect(
        parseAfterSaleEntry({ orderId: 'o', orderItemId, quantity }),
      ).toBeUndefined();
    },
  );
  it('parses only positive decimal route quantities', () => {
    expect(
      parseAfterSaleEntry({ orderId: 'o', orderItemId, quantity: '12' }),
    ).toEqual({ orderId: 'o', orderItemId, quantity: 12 });
  });
});
