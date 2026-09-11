import type { HttpClient } from '../../../../core/http';
import { paymentData, readPayment, type PaymentDetails } from '../api';

/** 仅供显式开发联调调用；不由支付页面或生产装配导入。 */
export async function completeDevelopmentPayment(
  http: HttpClient,
  payment: PaymentDetails,
  options: {
    environment: 'development' | 'staging' | 'production';
    confirmed: boolean;
  },
): Promise<{ payment: PaymentDetails; outcome: string }> {
  if (
    options.environment !== 'development' ||
    options.confirmed !== true ||
    payment.provider !== 'MOCK'
  ) {
    throw new Error(
      'Mock payment requires an explicitly confirmed development operation',
    );
  }
  const data = paymentData(
    await http.request<unknown>(
      `/api/v1/mock-payments/${encodeURIComponent(payment.paymentNo)}/success`,
      { method: 'POST', authenticated: false, retry: 0 },
    ),
  );
  const result = readPayment(data.payment);
  if (
    result.paymentId !== payment.paymentId ||
    result.orderId !== payment.orderId ||
    result.userId !== payment.userId ||
    result.provider !== 'MOCK'
  ) {
    throw new Error('Mock payment identity mismatch');
  }
  if (
    data.outcome !== 'PAID' &&
    data.outcome !== 'ALREADY_PROCESSED' &&
    data.outcome !== 'COMPENSATION_REQUIRED'
  ) {
    throw new Error('Invalid mock payment outcome');
  }
  // COMPENSATION_REQUIRED 不能解释为订单付款完成，仍需 GET 查询。
  return { payment: result, outcome: data.outcome };
}
