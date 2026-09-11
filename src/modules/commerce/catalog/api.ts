import type { HttpClient } from '../../../core/http';

export type SearchSort =
  | 'relevance'
  | 'sales'
  | 'price_asc'
  | 'price_desc'
  | 'newest';
export interface SearchFilter {
  keyword?: string;
  category?: string;
  sort?: SearchSort;
  priceMin?: number;
  priceMax?: number;
}
export interface SearchProduct {
  productId: string;
  name: string;
  subtitle: string | null;
  categoryId: string;
  categoryName: string;
  salePrice: number;
  sales: number;
  status: string;
  createdAt: string;
}
export interface SearchPage {
  items: SearchProduct[];
  page: number;
  pageSize: number;
  total: number;
}
export interface CatalogSku {
  id: string;
  productId: string;
  skuCode: string;
  name: string;
  attributes: Record<string, unknown>;
  price: string;
  originalPrice: string | null;
  currency: string;
  status: string;
}
export interface SkuInventory {
  skuId: string;
  available: number;
}

export class CatalogRepository {
  constructor(private readonly http: Pick<HttpClient, 'request'>) {}

  async search(
    filter: SearchFilter,
    page = 1,
    pageSize = 20,
  ): Promise<SearchPage> {
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new Error('Invalid catalog pagination');
    }
    for (const price of [filter.priceMin, filter.priceMax]) {
      if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
        throw new Error('Invalid catalog price filter');
      }
    }
    if (
      filter.priceMin !== undefined &&
      filter.priceMax !== undefined &&
      filter.priceMin > filter.priceMax
    ) {
      throw new Error('Invalid catalog price range');
    }
    const parameters: Record<string, string | number | undefined> = {
      keyword: filter.keyword?.trim() || undefined,
      category: filter.category || undefined,
      sort: filter.sort,
      priceMin: filter.priceMin,
      priceMax: filter.priceMax,
      page,
      pageSize,
    };
    const query = Object.entries(parameters)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
    const { data } = await this.http.request<{ data: SearchPage }>(
      `/api/v1/search/products?${query}`,
      { authenticated: false },
    );
    if (
      !Array.isArray(data.items) ||
      data.items.some(
        item =>
          typeof item.salePrice !== 'number' ||
          !Number.isFinite(item.salePrice) ||
          item.salePrice < 0,
      )
    ) {
      throw new Error('Invalid search product price');
    }
    // 搜索没有 currency；保留 number，禁止映射到旧 Product.priceMinor 或补默认币种。
    return data;
  }

  async hot(): Promise<{ keyword: string; count: number }[]> {
    const { data } = await this.http.request<{
      data: { keyword: string; count: number }[];
    }>('/api/v1/search/hot', { authenticated: false });
    return data;
  }

  async listSkus(productId: string): Promise<CatalogSku[]> {
    const { data } = await this.http.request<{ data: CatalogSku[] }>(
      `/api/v1/products/${encodeURIComponent(productId)}/skus`,
      { authenticated: false },
    );
    data.forEach(sku => validateSku(sku, productId));
    return data;
  }

  async getSku(skuId: string): Promise<CatalogSku> {
    const { data } = await this.http.request<{ data: CatalogSku }>(
      `/api/v1/skus/${encodeURIComponent(skuId)}`,
      { authenticated: false },
    );
    validateSku(data);
    if (data.id !== skuId) {
      throw new Error('Mismatched SKU');
    }
    return data;
  }

  async inventory(skuId: string): Promise<SkuInventory> {
    const { data } = await this.http.request<{ data: SkuInventory }>(
      `/api/v1/inventory/skus/${encodeURIComponent(skuId)}`,
      { authenticated: true },
    );
    if (
      data.skuId !== skuId ||
      !Number.isSafeInteger(data.available) ||
      data.available < 0
    ) {
      throw new Error('Invalid SKU inventory');
    }
    return data;
  }
}

function validateSku(sku: CatalogSku, productId?: string): void {
  const mismatchedProduct =
    productId !== undefined && sku.productId !== productId;
  if (
    !sku.id ||
    !sku.productId ||
    mismatchedProduct ||
    typeof sku.price !== 'string' ||
    !/^\d+(?:\.\d+)?$/.test(sku.price)
  ) {
    throw new Error('Invalid catalog SKU');
  }
}
