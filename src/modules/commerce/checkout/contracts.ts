import type { SkuSelection } from '../cart/contracts';
import type { ShippingAddress } from './shippingAddress';

export type CheckoutInput = Readonly<{
  items: readonly SkuSelection[];
  couponId?: string;
  shippingAddress: ShippingAddress;
}>;
export type PricingInput = Pick<CheckoutInput, 'items' | 'couponId'>;
export type PricingSummary = Readonly<{
  originalAmount: string;
  promotionDiscountAmount: string;
  couponDiscountAmount: string;
  shippingAmount: string;
  shippingDiscountAmount: string;
  discountAmount: string;
  payableAmount: string;
}>;
export interface CheckoutPort {
  preview(input: PricingInput): Promise<PricingSummary>;
  create(
    input: CheckoutInput,
    operation: { idempotencyKey: string },
  ): Promise<{ orderId: string }>;
}
