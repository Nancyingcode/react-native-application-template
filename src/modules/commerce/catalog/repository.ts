import type { HttpClient } from '../../../core/http';
import type { Product, ProductPage } from './types';
interface ProductResponse {
  id: string;
  name: string;
  subtitle?: string | null;
  description: string | null;
  categoryName: string;
  mainImage?: string | null;
  images?: string[] | null;
  basePrice: string;
  currency: string;
}

interface ApiResponse<T> {
  data: T;
}

interface ProductListResponse {
  items: ProductResponse[];
  page: number;
  pageSize: number;
  total: number;
}

function mapProduct(product: ProductResponse): Product {
  return {
    id: product.id,
    name: product.name,
    subtitle: product.subtitle ?? '',
    description: product.description ?? '',
    category: product.categoryName,
    imageUrl: product.mainImage || product.images?.[0] || '',
    priceMinor: toPriceMinor(product.basePrice),
    currency: product.currency,
    // 商品接口不提供 SKU 库存，未知库存不能视为售罄或虚构可售数量。
    inventory: null,
  };
}

function toPriceMinor(price: string): number {
  if (typeof price !== 'string' || !/^\d+(?:\.\d+)?$/.test(price)) {
    throw new Error('Invalid product basePrice');
  }
  const [major, fraction = ''] = price.split('.');
  // 按十进制字符串取分并四舍五入，避免浮点乘法将 1.005 错算为 100 分。
  const minor = Number(`${major}${fraction.padEnd(2, '0').slice(0, 2)}`);
  const roundedMinor = minor + (Number(fraction[2] ?? '0') >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(minor) || !Number.isSafeInteger(roundedMinor)) {
    throw new Error('Product basePrice exceeds the safe integer range');
  }
  return roundedMinor;
}

export async function listProducts(
  http: HttpClient,
  page = 1,
  pageSize = 20,
): Promise<ProductPage> {
  const response = await http.request<ApiResponse<ProductListResponse>>(
    `/api/v1/products?page=${page}&pageSize=${pageSize}`,
    {
      authenticated: false,
    },
  );
  return {
    ...response.data,
    items: response.data.items.map(mapProduct),
  };
}
export async function getProduct(
  http: HttpClient,
  id: string,
): Promise<Product> {
  const response = await http.request<ApiResponse<ProductResponse>>(
    `/api/v1/products/${encodeURIComponent(id)}`,
    {
      authenticated: false,
    },
  );
  return mapProduct(response.data);
}
