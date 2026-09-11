import type { HttpClient, RequestOptions } from '../../../core/http';

export interface ServerCartItem {
  id: string;
  skuId: string;
  productId: string;
  productName: string;
  skuName: string;
  quantity: number;
  selected: boolean;
  currentPrice: string;
  currency: string;
  available: number;
  saleable: boolean;
  inStock: boolean;
  valid: boolean;
  invalidReason: string | null;
}
export interface ServerCart {
  userId: string;
  items: ServerCartItem[];
}
export interface GuestSku {
  id: string;
  productId: string;
  name: string;
  price: string;
  currency: string;
  status: string;
}
export function assertId(id: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new Error('Invalid cart identifier');
  }
}
export function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Error('Cart quantity must be an integer from 1 to 99');
  }
}
export class CartRepository {
  constructor(private readonly http: HttpClient) {}

  private async request(
    path = '',
    options: RequestOptions = {},
  ): Promise<ServerCart> {
    const { data } = await this.http.request<{ data: ServerCart }>(
      `/api/v1/cart${path}`,
      options,
    );
    if (
      !data ||
      typeof data.userId !== 'string' ||
      !Array.isArray(data.items)
    ) {
      throw new Error('Invalid cart response');
    }
    data.items.forEach(item => {
      assertId(item.id);
      assertId(item.skuId);
      assertId(item.productId);
      if (
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        !Number.isSafeInteger(item.available) ||
        item.available < 0 ||
        typeof item.currentPrice !== 'string' ||
        !/^\d+(?:\.\d+)?$/.test(item.currentPrice) ||
        typeof item.selected !== 'boolean' ||
        typeof item.valid !== 'boolean' ||
        typeof item.saleable !== 'boolean' ||
        typeof item.inStock !== 'boolean'
      ) {
        throw new Error('Invalid cart item response');
      }
    });
    return data;
  }
  get(): Promise<ServerCart> {
    return this.request();
  }
  add(skuId: string, quantity: number): Promise<ServerCart> {
    assertId(skuId);
    assertQuantity(quantity);
    return this.request('/items', {
      method: 'POST',
      body: { skuId, quantity },
      retry: 0,
    });
  }
  update(
    id: string,
    patch: { quantity?: number; selected?: boolean },
  ): Promise<ServerCart> {
    assertId(id);
    if (patch.quantity !== undefined) {
      assertQuantity(patch.quantity);
    }
    return this.request(`/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
      retry: 0,
    });
  }
  remove(id: string): Promise<ServerCart> {
    assertId(id);
    return this.request(`/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      retry: 0,
    });
  }
  removeMany(itemIds: readonly string[]): Promise<ServerCart> {
    itemIds.forEach(assertId);
    return this.request('/items', {
      method: 'DELETE',
      body: { itemIds },
      retry: 0,
    });
  }
  select(itemIds: readonly string[], selected: boolean): Promise<ServerCart> {
    itemIds.forEach(assertId);
    return this.request('/items/select', {
      method: 'POST',
      body: { itemIds, selected },
      retry: 0,
    });
  }
  clear(): Promise<ServerCart> {
    return this.request('', { method: 'DELETE', retry: 0 });
  }
  async getSku(skuId: string): Promise<GuestSku> {
    assertId(skuId);
    const { data } = await this.http.request<{ data: GuestSku }>(
      `/api/v1/skus/${encodeURIComponent(skuId)}`,
      { authenticated: false },
    );
    if (!data || data.id !== skuId) {
      throw new Error('Invalid SKU response');
    }
    assertId(data.productId);
    return data;
  }
}
