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

import { getProduct, listProducts } from './catalog/repository';
import { createOrder } from './checkout/repository';
import { createPayment, getPaymentStatus } from './payments/repository';
export class CommerceRepository {
  constructor(private readonly http: HttpClient) {}
  listProducts(page = 1, pageSize = 20): Promise<ProductPage> {
    return listProducts(this.http, page, pageSize);
  }
  getProduct(id: string): Promise<Product> {
    return getProduct(this.http, id);
  }
  createOrder(lines: CartLine[]): Promise<Order> {
    return createOrder(this.http, lines);
  }
  createPayment(
    orderId: string,
    provider: PaymentProvider,
  ): Promise<PaymentSession> {
    return createPayment(this.http, orderId, provider);
  }
  getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    return getPaymentStatus(this.http, paymentId);
  }
}
