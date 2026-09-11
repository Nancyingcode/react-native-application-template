export type OrderForAfterSale = Readonly<{
  orderId: string;
  status: string;
  items: readonly Readonly<{
    orderItemId: string;
    productId: string;
    skuId: string;
    quantity: number;
  }>[];
}>;
export interface OrdersPort {
  getForAfterSale(orderId: string): Promise<OrderForAfterSale>;
}
