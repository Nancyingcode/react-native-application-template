import type { HttpClient } from '../../../core/http';
import { validateShippingAddress } from '../checkout/shippingAddress';
import type {
  SeckillActivity,
  SeckillPort,
  SeckillReceipt,
  SeckillRequest,
  SeckillToken,
} from './types';

export function assertSeckillId(id: string): void {
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('Invalid seckill identifier');
  }
}

export function validateActivity(value: SeckillActivity): void {
  const validDate = (date: string) =>
    typeof date === 'string' && Number.isFinite(Date.parse(date));
  if (
    !value ||
    !value.id ||
    typeof value.name !== 'string' ||
    typeof value.status !== 'string' ||
    !validDate(value.startAt) ||
    !validDate(value.endAt) ||
    Date.parse(value.endAt) <= Date.parse(value.startAt) ||
    !Array.isArray(value.skus)
  ) {
    throw new Error('Invalid seckill activity');
  }
  const ids = new Set<string>();
  for (const sku of value.skus) {
    const counts = [sku.totalStock, sku.availableStock, sku.perUserLimit];
    if (
      !sku.skuId ||
      ids.has(sku.skuId) ||
      sku.activityId !== value.id ||
      typeof sku.seckillPrice !== 'string' ||
      !/^\d+(?:\.\d+)?$/.test(sku.seckillPrice) ||
      counts.some(count => !Number.isSafeInteger(count) || count < 0) ||
      sku.availableStock > sku.totalStock
    ) {
      throw new Error('Invalid seckill SKU');
    }
    ids.add(sku.skuId);
  }
}

export class SeckillRepository implements SeckillPort {
  constructor(private readonly http: Pick<HttpClient, 'request'>) {}
  async list(): Promise<SeckillActivity[]> {
    const { data } = await this.http.request<{ data: SeckillActivity[] }>(
      '/api/v1/seckill/activities',
      { authenticated: true },
    );
    if (!Array.isArray(data)) {
      throw new Error('Invalid seckill list');
    }
    data.forEach(validateActivity);
    return data;
  }
  async get(activityId: string): Promise<SeckillActivity> {
    assertSeckillId(activityId);
    const { data } = await this.http.request<{ data: SeckillActivity }>(
      `/api/v1/seckill/activities/${encodeURIComponent(activityId)}`,
      { authenticated: true },
    );
    validateActivity(data);
    if (data.id !== activityId) {
      throw new Error('Mismatched seckill activity');
    }
    return data;
  }
  async token(activityId: string): Promise<SeckillToken> {
    assertSeckillId(activityId);
    // 虽然使用 GET，签发令牌仍有副作用，不使用默认重试或缓存。
    const { data } = await this.http.request<{ data: SeckillToken }>(
      `/api/v1/seckill/${encodeURIComponent(activityId)}/token`,
      { authenticated: true, retry: 0 },
    );
    if (
      !data ||
      typeof data.token !== 'string' ||
      !data.token.trim() ||
      !Number.isFinite(Date.parse(data.expiresAt))
    ) {
      throw new Error('Invalid seckill token');
    }
    return data;
  }
  async request(
    activityId: string,
    skuId: string,
    input: SeckillRequest,
  ): Promise<SeckillReceipt> {
    assertSeckillId(activityId);
    assertSeckillId(skuId);
    const address = validateShippingAddress(input.shippingAddress);
    if (
      !address.valid ||
      !input.token?.trim() ||
      !Number.isInteger(input.quantity) ||
      input.quantity < 1 ||
      input.quantity > 10
    ) {
      throw new Error('Invalid seckill request');
    }
    const { data } = await this.http.request<{ data: SeckillReceipt }>(
      `/api/v1/seckill/${encodeURIComponent(
        activityId,
      )}/skus/${encodeURIComponent(skuId)}/request`,
      {
        method: 'POST',
        authenticated: true,
        retry: 0,
        body: {
          token: input.token,
          quantity: input.quantity,
          shippingAddress: address.value,
        },
      },
    );
    if (
      !data ||
      data.status !== 'QUEUED' ||
      typeof data.requestId !== 'string' ||
      !data.requestId.trim()
    ) {
      throw new Error('Unconfirmed seckill response');
    }
    return { status: 'QUEUED', requestId: data.requestId };
  }
}
