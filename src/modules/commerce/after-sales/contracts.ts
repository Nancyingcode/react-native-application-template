export type AfterSaleEntry = Readonly<{
  orderId: string;
  orderItemId: string;
  quantity: number;
}>;

export type RefundInput = {
  orderId: string;
  type?: 'REFUND_ONLY' | 'RETURN_AND_REFUND';
  items: { orderItemId: string; quantity: number }[];
  reason: string;
};

export type AfterSaleInput = {
  orderId: string;
  type: 'REFUND_ONLY' | 'RETURN_REFUND';
  items: { orderItemId: string; quantity: number }[];
  reason: string;
  description?: string;
};

export interface AfterSalesPort {
  requestRefund(
    input: RefundInput,
    operation: { idempotencyKey: string },
  ): Promise<{ refundId: string; status: string }>;
  requestAfterSale(
    input: AfterSaleInput,
  ): Promise<{ afterSaleId: string; status: string }>;
}
