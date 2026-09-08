export interface Product {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  category: string;
  imageUrl: string;
  priceMinor: number;
  currency: string;
  inventory: number | null;
}

export interface ProductPage {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
}
