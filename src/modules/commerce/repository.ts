import type { HttpClient } from '../../core/http';
import type {
  CartLine,
  Order,
  PaymentProvider,
  PaymentSession,
  PaymentStatus,
  Product,
} from './types';

interface ProductListResponse {
  items: Product[];
}

interface PaymentStatusResponse {
  status: PaymentStatus;
}

export class CommerceRepository {
  constructor(private readonly http: HttpClient) {}

  async listProducts(): Promise<Product[]> {
    const response = await this.http.request<ProductListResponse>(
      '/v1/commerce/products',
      {
        authenticated: false,
        cache: { key: 'commerce:products', ttlMs: 60_000 },
      },
    );
    return response.items;
  }

  getProduct(id: string): Promise<Product> {
    return this.http.request<Product>(
      `/v1/commerce/products/${encodeURIComponent(id)}`,
      {
        authenticated: false,
        cache: { key: `commerce:product:${id}`, ttlMs: 60_000 },
      },
    );
  }

  createOrder(lines: CartLine[]): Promise<Order> {
    return this.http.request<Order>('/v1/commerce/orders', {
      method: 'POST',
      body: {
        idempotencyKey: createIdempotencyKey(),
        lines: lines.map(line => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
      },
      authenticated: true,
      retry: 0,
    });
  }

  createPayment(
    orderId: string,
    provider: PaymentProvider,
  ): Promise<PaymentSession> {
    return this.http.request<PaymentSession>('/v1/commerce/payments', {
      method: 'POST',
      body: { orderId, provider, idempotencyKey: createIdempotencyKey() },
      authenticated: true,
      retry: 0,
    });
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    const response = await this.http.request<PaymentStatusResponse>(
      '/v1/commerce/payments/status',
      {
        method: 'POST',
        body: { paymentId },
        authenticated: true,
        retry: 0,
      },
    );
    return response.status;
  }
}

function createIdempotencyKey(): string {
  return `commerce-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
