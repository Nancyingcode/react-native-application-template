import type { HttpClient } from '../../../core/http';
import type {
  NewPaymentProvider,
  PaymentEntry,
  PaymentResult,
  PaymentsPort,
} from './contracts';

export type PaymentDetails = PaymentResult &
  Readonly<{
    userId: string;
    paymentNo: string;
    provider: NewPaymentProvider;
    expiredAt: string | null;
  }>;

export function assertPaymentId(value: string): void {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Invalid payment or order identifier');
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid payment response');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Invalid payment response field');
  }
  return value;
}

export function paymentProvider(value: unknown): NewPaymentProvider {
  if (value !== 'MOCK' && value !== 'WECHAT_PAY' && value !== 'ALIPAY') {
    throw new Error('Invalid payment provider');
  }
  return value;
}

export function readPayment(value: unknown): PaymentDetails {
  const dto = record(value);
  const amount = string(dto.amount);
  if (!/^\d+(?:\.\d+)?$/.test(amount)) {
    throw new Error('Invalid payment decimal');
  }
  if (
    dto.expiredAt !== null &&
    (typeof dto.expiredAt !== 'string' ||
      !Number.isFinite(Date.parse(dto.expiredAt)))
  ) {
    throw new Error('Invalid payment expiry');
  }
  return Object.freeze({
    paymentId: string(dto.id),
    orderId: string(dto.orderId),
    userId: string(dto.userId),
    paymentNo: string(dto.paymentNo),
    provider: paymentProvider(dto.provider),
    status: string(dto.status),
    amount,
    currency: string(dto.currency),
    expiredAt: dto.expiredAt,
  });
}

export function paymentData(response: unknown): Record<string, unknown> {
  return record(record(response).data);
}

export class PaymentsRepository implements PaymentsPort {
  constructor(private readonly http: HttpClient) {}

  async create(
    input: PaymentEntry & { provider?: NewPaymentProvider },
    operation: { idempotencyKey: string },
  ): Promise<PaymentDetails> {
    assertPaymentId(input.orderId);
    if (!/^[A-Za-z0-9._-]{8,128}$/.test(operation.idempotencyKey)) {
      throw new Error('Invalid payment idempotency key');
    }
    const body =
      input.provider === undefined
        ? {}
        : { provider: paymentProvider(input.provider) };
    const data = paymentData(
      await this.http.request<unknown>(
        `/api/v1/orders/${encodeURIComponent(input.orderId)}/payments`,
        {
          method: 'POST',
          body,
          authenticated: true,
          retry: 0,
          headers: { 'Idempotency-Key': operation.idempotencyKey },
        },
      ),
    );
    const result = readPayment(data.payment);
    if (result.orderId !== input.orderId) {
      throw new Error('Payment belongs to a different order');
    }
    if (result.provider !== (input.provider ?? 'MOCK')) {
      throw new Error('Payment provider mismatch');
    }
    // 当前参数没有 SDK/跳转契约，不把 mockSuccessPath 当作支付链接。
    return result;
  }

  async get(paymentId: string): Promise<PaymentDetails> {
    assertPaymentId(paymentId);
    const result = readPayment(
      paymentData(
        await this.http.request<unknown>(
          `/api/v1/payments/${encodeURIComponent(paymentId)}`,
          { authenticated: true },
        ),
      ),
    );
    if (result.paymentId !== paymentId) {
      throw new Error('Payment identifier mismatch');
    }
    return result;
  }
}
