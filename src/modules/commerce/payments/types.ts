export type PaymentProvider = 'wechat' | 'alipay';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface PaymentSession {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  redirectUrl: string;
  status: PaymentStatus;
}
