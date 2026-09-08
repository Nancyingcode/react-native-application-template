import type { HttpClient } from '../../../core/http';
import { createIdempotencyKey } from '../shared/idempotency';
import type { PaymentProvider, PaymentSession, PaymentStatus } from './types';
interface PaymentStatusResponse {
  status: PaymentStatus;
}

export function createPayment(
  http: HttpClient,
  orderId: string,
  provider: PaymentProvider,
): Promise<PaymentSession> {
  return http.request<PaymentSession>('/v1/commerce/payments', {
    method: 'POST',
    body: { orderId, provider, idempotencyKey: createIdempotencyKey() },
    authenticated: true,
    retry: 0,
  });
}
export async function getPaymentStatus(
  http: HttpClient,
  paymentId: string,
): Promise<PaymentStatus> {
  const response = await http.request<PaymentStatusResponse>(
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
