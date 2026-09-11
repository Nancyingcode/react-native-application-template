import type { AfterSaleEntry, AfterSaleInput, RefundInput } from './contracts';

export class AfterSaleValidationError extends Error {
  constructor() {
    super('Invalid after-sale request');
  }
}

export function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseAfterSaleEntry(
  params: Readonly<Record<string, string>>,
): AfterSaleEntry | undefined {
  const quantity = Number(params.quantity);
  const validQuantity =
    /^[1-9]\d*$/.test(params.quantity ?? '') && Number.isSafeInteger(quantity);
  if (
    !validId(params.orderId) ||
    !validId(params.orderItemId) ||
    !validQuantity
  ) {
    return undefined;
  }
  return { orderId: params.orderId, orderItemId: params.orderItemId, quantity };
}

export function validateInput(
  input: RefundInput | AfterSaleInput,
  flow: 'refund' | 'afterSale',
): void {
  const types =
    flow === 'refund'
      ? ['REFUND_ONLY', 'RETURN_AND_REFUND']
      : ['REFUND_ONLY', 'RETURN_REFUND'];
  const validType =
    (flow === 'refund' && input.type === undefined) ||
    types.includes(input.type ?? '');
  if (
    !validId(input.orderId) ||
    !validId(input.reason) ||
    !validType ||
    !Array.isArray(input.items) ||
    input.items.length === 0
  ) {
    throw new AfterSaleValidationError();
  }
  const seen = new Set<string>();
  for (const item of input.items) {
    const validQuantity =
      Number.isSafeInteger(item.quantity) && item.quantity > 0;
    const validRefundItem =
      flow !== 'refund' ||
      (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        item.orderItemId,
      ) &&
        item.quantity <= 999);
    if (
      !validId(item.orderItemId) ||
      seen.has(item.orderItemId) ||
      !validQuantity ||
      !validRefundItem
    ) {
      throw new AfterSaleValidationError();
    }
    seen.add(item.orderItemId);
  }
  if (
    'description' in input &&
    input.description !== undefined &&
    typeof input.description !== 'string'
  ) {
    throw new AfterSaleValidationError();
  }
}
