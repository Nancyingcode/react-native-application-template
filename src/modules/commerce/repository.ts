import type { HttpClient } from '../../core/http';
import type {
  CartLine,
  Order,
  PaymentProvider,
  PaymentSession,
  PaymentStatus,
  Product,
  ProductPage,
} from './types';

interface ProductResponse {
  id: string;
  name: string;
  subtitle?: string | null;
  description: string | null;
  categoryName: string;
  mainImage?: string | null;
  images?: string[] | null;
  basePrice: string;
  currency: string;
}

interface ApiResponse<T> {
  data: T;
}

interface ProductListResponse {
  items: ProductResponse[];
  page: number;
  pageSize: number;
  total: number;
}

interface PaymentStatusResponse {
  status: PaymentStatus;
}

export class CommerceRepository {
  constructor(private readonly http: HttpClient) {}

  async listProducts(page = 1, pageSize = 20): Promise<ProductPage> {
    const response = await this.http.request<ApiResponse<ProductListResponse>>(
      `/api/v1/products?page=${page}&pageSize=${pageSize}`,
      {
        authenticated: false,
      },
    );
    return {
      ...response.data,
      items: response.data.items.map(mapProduct),
    };
  }

  async getProduct(id: string): Promise<Product> {
    const response = await this.http.request<ApiResponse<ProductResponse>>(
      `/api/v1/products/${encodeURIComponent(id)}`,
      {
        authenticated: false,
      },
    );
    return mapProduct(response.data);
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

function mapProduct(product: ProductResponse): Product {
  return {
    id: product.id,
    name: product.name,
    subtitle: product.subtitle ?? '',
    description: product.description ?? '',
    category: product.categoryName,
    imageUrl: product.mainImage || product.images?.[0] || '',
    priceMinor: toPriceMinor(product.basePrice),
    currency: product.currency,
    // 商品接口不提供 SKU 库存，未知库存不能视为售罄或虚构可售数量。
    inventory: null,
  };
}

function toPriceMinor(price: string): number {
  if (typeof price !== 'string' || !/^\d+(?:\.\d+)?$/.test(price)) {
    throw new Error('Invalid product basePrice');
  }
  const [major, fraction = ''] = price.split('.');
  // 按十进制字符串取分并四舍五入，避免浮点乘法将 1.005 错算为 100 分。
  const minor = Number(`${major}${fraction.padEnd(2, '0').slice(0, 2)}`);
  const roundedMinor = minor + (Number(fraction[2] ?? '0') >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(minor) || !Number.isSafeInteger(roundedMinor)) {
    throw new Error('Product basePrice exceeds the safe integer range');
  }
  return roundedMinor;
}

function createIdempotencyKey(): string {
  return `commerce-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
