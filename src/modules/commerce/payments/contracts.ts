export type PaymentEntry = Readonly<{ orderId: string }>;
export type NewPaymentProvider = 'MOCK' | 'WECHAT_PAY' | 'ALIPAY';
export type PaymentResult = Readonly<{
  paymentId: string;
  orderId: string;
  status: string;
  amount: string;
  currency: string;
}>;
export interface PaymentsPort {
  create(
    input: PaymentEntry & { provider?: NewPaymentProvider },
    operation: { idempotencyKey: string },
  ): Promise<PaymentResult>;
  get(paymentId: string): Promise<PaymentResult>;
}
