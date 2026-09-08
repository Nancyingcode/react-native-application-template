import type { HttpClient } from '../../../core/http';
import type { CartLine } from '../cart/types';
import { createIdempotencyKey } from '../shared/idempotency';
import type { Order } from './types';
export function createOrder(
  http: HttpClient,
  lines: CartLine[],
): Promise<Order> {
  return http.request<Order>('/v1/commerce/orders', {
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
