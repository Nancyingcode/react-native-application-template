import type { SessionManager } from '../../../core/auth';
import {
  ApiError,
  AuthenticationRequiredError,
  type HttpClient,
} from '../../../core/http';
import type { OrdersPort, OrderForAfterSale } from './contracts';
import type {
  OrderResponseDto,
  OrderPageResponseDto,
  ReceiptResponseDto,
} from './types';

export const orderStatuses = [
  'PENDING_PAYMENT',
  'PAID',
  'PROCESSING',
  'SHIPPED',
  'COMPLETED',
  'CANCELLED',
  'CLOSED',
  'PARTIALLY_REFUNDED',
  'REFUNDING',
  'REFUNDED',
] as const;
export interface OrderFilter {
  status?: (typeof orderStatuses)[number];
  orderNo?: string;
  createdFrom?: string;
  createdTo?: string;
}
export class OrdersRepository implements OrdersPort {
  private readonly pending = new Map<string, 'cancel' | 'receipt'>();
  private readonly unsubscribe: () => void;
  constructor(
    private readonly http: Pick<HttpClient, 'request'>,
    private readonly session: SessionManager,
  ) {
    let owner = session.getSnapshot()?.userId;
    this.unsubscribe = session.subscribe(() => {
      const next = session.getSnapshot()?.userId;
      if (next !== owner) {
        this.pending.clear();
        owner = next;
      }
    });
  }
  dispose(): void {
    this.unsubscribe();
    this.pending.clear();
  }
  isActionBlocked(orderId: string): boolean {
    return this.pending.has(orderId);
  }

  private async perform<T>(
    orderId: string,
    action: 'cancel' | 'receipt',
    request: () => Promise<T>,
  ): Promise<T> {
    id(orderId);
    if (!this.session.getSnapshot()) {
      throw new AuthenticationRequiredError();
    }
    if (this.pending.has(orderId)) {
      throw new Error('Order action requires reconciliation');
    }
    this.pending.set(orderId, action);
    const owner = this.session.getSnapshot()?.userId;
    let changed = false;
    const stop = this.session.subscribe(() => {
      if (this.session.getSnapshot()?.userId !== owner) {
        changed = true;
      }
    });
    try {
      const result = await request();
      if (!changed) {
        this.pending.delete(orderId);
      }
      return result;
    } catch (error) {
      // 未知结果跨页面保留，不能用新的幂等键绕过服务端仍在处理的操作。
      const definitive =
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        !['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_IN_PROGRESS'].includes(
          error.code,
        );
      if (!changed && definitive) {
        this.pending.delete(orderId);
      }
      throw error;
    } finally {
      stop();
    }
  }

  private async read<T>(
    path: string,
    options?: Parameters<HttpClient['request']>[1],
  ): Promise<T> {
    const owner = this.session.getSnapshot()?.userId;
    if (!owner) {
      throw new AuthenticationRequiredError();
    }
    let changed = false;
    const unsubscribe = this.session.subscribe(() => {
      if (this.session.getSnapshot()?.userId !== owner) {
        changed = true;
      }
    });
    try {
      const response = await this.http.request<{ data: T }>(path, options);
      if (changed || this.session.getSnapshot()?.userId !== owner) {
        throw new AuthenticationRequiredError();
      }
      if (!response || response.data == null) {
        throw new Error('Invalid order response');
      }
      return response.data;
    } finally {
      unsubscribe();
    }
  }

  async list(
    filter: OrderFilter = {},
    page = 1,
    pageSize = 20,
  ): Promise<OrderPageResponseDto> {
    validatePage(page, Number.MAX_SAFE_INTEGER);
    validatePage(pageSize, 100);
    if (filter.status && !orderStatuses.includes(filter.status)) {
      throw new Error('Invalid order status');
    }
    if ((filter.orderNo?.length ?? 0) > 40) {
      throw new Error('Invalid order number');
    }
    for (const date of [filter.createdFrom, filter.createdTo]) {
      if (
        date &&
        (!/^\d{4}-\d{2}-\d{2}T/.test(date) ||
          !Number.isFinite(Date.parse(date)))
      ) {
        throw new Error('Invalid order date');
      }
    }
    if (
      filter.createdFrom &&
      filter.createdTo &&
      Date.parse(filter.createdFrom) > Date.parse(filter.createdTo)
    ) {
      throw new Error('Invalid order date range');
    }
    const result = await this.read<OrderPageResponseDto>(
      `/api/v1/orders?${query({ page, pageSize, ...filter })}`,
    );
    this.validateItems(result.items);
    validatePage(result.page, Number.MAX_SAFE_INTEGER);
    validatePage(result.pageSize, 100);
    if (!Number.isSafeInteger(result.total) || result.total < 0) {
      throw new Error('Invalid order total');
    }
    return result;
  }

  async listCursor(
    after?: string,
    limit = 20,
  ): Promise<{ items: OrderResponseDto[]; nextCursor: string | null }> {
    validatePage(limit, 100);
    const result = await this.read<{
      items: OrderResponseDto[];
      nextCursor: string | null;
    }>(`/api/v1/orders/cursor?${query({ after, limit })}`);
    this.validateItems(result.items);
    if (result.nextCursor !== null && typeof result.nextCursor !== 'string') {
      throw new Error('Invalid order cursor');
    }
    return result;
  }

  private validateItems(items: OrderResponseDto[]): void {
    const owner = this.session.getSnapshot()?.userId;
    if (
      !Array.isArray(items) ||
      items.some(item => !item.id || item.userId !== owner)
    ) {
      throw new Error('Invalid order page');
    }
  }

  async get(orderId: string): Promise<OrderResponseDto> {
    const order = await this.read<OrderResponseDto>(
      `/api/v1/orders/${id(orderId)}`,
    );
    if (
      order.id !== orderId ||
      order.userId !== this.session.getSnapshot()?.userId ||
      !Array.isArray(order.items) ||
      !Array.isArray(order.statusTimeline)
    ) {
      throw new Error('Invalid order response');
    }
    const pending = this.pending.get(orderId);
    const reconciled =
      (pending === 'cancel' && order.status === 'CANCELLED') ||
      (pending === 'receipt' && order.status === 'COMPLETED');
    if (reconciled) {
      this.pending.delete(orderId);
    }
    return order;
  }

  cancel(
    orderId: string,
    operation: { idempotencyKey: string },
  ): Promise<OrderResponseDto> {
    if (!/^[A-Za-z0-9._-]{8,128}$/.test(operation.idempotencyKey)) {
      throw new Error('Invalid idempotency key');
    }
    return this.perform(orderId, 'cancel', () =>
      this.read(`/api/v1/orders/${id(orderId)}/cancel`, {
        method: 'POST',
        retry: 0,
        headers: { 'Idempotency-Key': operation.idempotencyKey },
      }),
    );
  }

  confirmReceipt(orderId: string): Promise<ReceiptResponseDto> {
    return this.perform(orderId, 'receipt', () =>
      this.read(`/api/v1/orders/${id(orderId)}/confirm-receipt`, {
        method: 'POST',
        retry: 0,
      }),
    );
  }

  async getForAfterSale(orderId: string): Promise<OrderForAfterSale> {
    const order = await this.get(orderId);
    const items = order.items.map(item => {
      if (
        !item.id ||
        !item.productId ||
        !item.skuId ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1
      ) {
        throw new Error('Invalid order item');
      }
      return {
        orderItemId: item.id,
        productId: item.productId,
        skuId: item.skuId,
        quantity: item.quantity,
      };
    });
    return { orderId: order.id, status: order.status, items };
  }
}
function id(value: string): string {
  if (!value.trim()) {
    throw new Error('Missing order ID');
  }
  return encodeURIComponent(value);
}
function validatePage(value: number, max: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error('Invalid order pagination');
  }
}
function query(values: Record<string, string | number | undefined>): string {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&');
}
