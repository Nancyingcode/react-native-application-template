export type PaymentProvider = 'wechat' | 'alipay';

export interface Product {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: string;
  imageUrl: string;
  priceMinor: number;
  currency: string;
  inventory: number;
}

export interface CartLine {
  product: Product;
  quantity: number;
}

export interface Order {
  id: string;
  amountMinor: number;
  currency: string;
}

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
