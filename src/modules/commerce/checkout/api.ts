import type { HttpClient } from '../../../core/http';
import type {
  CheckoutInput,
  CheckoutPort,
  PricingInput,
  PricingSummary,
} from './contracts';
import { validateShippingAddress } from './shippingAddress';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const pricingFields = [
  'originalAmount',
  'promotionDiscountAmount',
  'couponDiscountAmount',
  'shippingAmount',
  'shippingDiscountAmount',
  'discountAmount',
  'payableAmount',
] as const;

export function copyPricingInput(input: PricingInput): PricingInput {
  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 50
  ) {
    throw new Error('Invalid checkout items');
  }
  const items = input.items.map(({ skuId, quantity }) => {
    if (
      !uuid.test(skuId) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      throw new Error('Invalid checkout SKU or quantity');
    }
    return { skuId, quantity };
  });
  if (new Set(items.map(item => item.skuId)).size !== items.length) {
    throw new Error('Duplicate checkout SKU');
  }
  if (input.couponId !== undefined && !uuid.test(input.couponId)) {
    throw new Error('Invalid user coupon ID');
  }
  return input.couponId === undefined
    ? { items }
    : { items, couponId: input.couponId };
}

export function copyCheckoutInput(input: CheckoutInput): CheckoutInput {
  const address = validateShippingAddress(input.shippingAddress);
  if (!address.valid) {
    throw new Error('Invalid shipping address');
  }
  return { ...copyPricingInput(input), shippingAddress: address.value };
}

export class CheckoutRepository implements CheckoutPort {
  constructor(private readonly http: HttpClient) {}
  async preview(input: PricingInput): Promise<PricingSummary> {
    const response = await this.http.request<{ data: PricingSummary }>(
      '/api/v1/pricing/preview',
      {
        method: 'POST',
        body: copyPricingInput(input),
        authenticated: true,
      },
    );
    const summary = response?.data;
    if (
      !summary ||
      pricingFields.some(
        field =>
          typeof summary[field] !== 'string' ||
          !/^\d+(\.\d+)?$/.test(summary[field]),
      )
    ) {
      throw new Error('Invalid pricing response');
    }
    // 保留 Decimal 原文；冻结接口没有币种/单位，不能推导分或元。
    return Object.fromEntries(
      pricingFields.map(field => [field, summary[field]]),
    ) as PricingSummary;
  }
  async create(
    input: CheckoutInput,
    operation: { idempotencyKey: string },
  ): Promise<{ orderId: string }> {
    if (!/^[A-Za-z0-9._-]{8,128}$/.test(operation.idempotencyKey)) {
      throw new Error('Invalid idempotency key');
    }
    const response = await this.http.request<{ data: { id: string } }>(
      '/api/v1/orders',
      {
        method: 'POST',
        body: copyCheckoutInput(input),
        authenticated: true,
        retry: 0,
        headers: { 'Idempotency-Key': operation.idempotencyKey },
      },
    );
    if (
      typeof response?.data?.id !== 'string' ||
      !uuid.test(response.data.id)
    ) {
      throw new Error('Invalid order response');
    }
    return { orderId: response.data.id };
  }
}
