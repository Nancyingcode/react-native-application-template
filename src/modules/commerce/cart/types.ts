import type { Product } from '../catalog/types';
export interface CartLine {
  product: Product;
  quantity: number;
}
