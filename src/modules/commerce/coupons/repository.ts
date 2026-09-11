import type { HttpClient } from '../../../core/http';

export const couponStatuses = [
  'AVAILABLE',
  'LOCKED',
  'USED',
  'EXPIRED',
  'CANCELLED',
] as const;
export type CouponStatus = (typeof couponStatuses)[number];
export interface UserCoupon {
  readonly id: string;
  readonly couponTemplateId: string;
  readonly name: string;
  readonly type: string;
  readonly status: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly orderId: string | null;
  readonly unavailableReason: string | null;
}

function parseCoupon(value: unknown): UserCoupon {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid coupon response');
  }
  const coupon = value as Record<string, unknown>;
  function requiredString(key: string): string {
    const field = coupon[key];
    if (typeof field !== 'string' || !field) {
      throw new Error(`Invalid coupon ${key}`);
    }
    return field;
  }
  function nullableString(key: string): string | null {
    const field = coupon[key];
    if (field !== null && typeof field !== 'string') {
      throw new Error(`Invalid coupon ${key}`);
    }
    return field;
  }
  return Object.freeze({
    id: requiredString('id'),
    couponTemplateId: requiredString('couponTemplateId'),
    name: requiredString('name'),
    type: requiredString('type'),
    status: requiredString('status'),
    validFrom: requiredString('validFrom'),
    validUntil: requiredString('validUntil'),
    orderId: nullableString('orderId'),
    unavailableReason: nullableString('unavailableReason'),
  });
}

export class CouponsRepository {
  constructor(private readonly http: Pick<HttpClient, 'request'>) {}

  private async list(path: string): Promise<readonly UserCoupon[]> {
    const response = await this.http.request<{ data: unknown }>(path);
    if (!Array.isArray(response?.data)) {
      throw new Error('Invalid coupons response');
    }
    return response.data.map(parseCoupon);
  }

  async my(status?: CouponStatus): Promise<readonly UserCoupon[]> {
    if (status !== undefined && !couponStatuses.includes(status)) {
      throw new Error('Invalid coupon status');
    }
    return this.list(
      `/api/v1/coupons/my${
        status ? `?status=${encodeURIComponent(status)}` : ''
      }`,
    );
  }

  available(): Promise<readonly UserCoupon[]> {
    return this.list('/api/v1/coupons/available');
  }

  async claim(
    couponTemplateId: string,
    idempotencyKey: string,
  ): Promise<UserCoupon> {
    if (!couponTemplateId.trim() || !idempotencyKey.trim()) {
      throw new Error('Coupon template and idempotency key are required');
    }
    const response = await this.http.request<{ data: unknown }>(
      `/api/v1/coupons/${encodeURIComponent(couponTemplateId)}/claim`,
      {
        method: 'POST',
        retry: 0,
        headers: { 'Idempotency-Key': idempotencyKey },
      },
    );
    return parseCoupon(response?.data);
  }
}
