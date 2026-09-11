export type SkuSelection = Readonly<{ skuId: string; quantity: number }>;
export type CartOwner = Readonly<{ userId: string | null; generation: number }>;
export type SelectedCartItem = SkuSelection &
  Readonly<{ productId: string; cartItemId: string | null }>;
export type CheckoutSnapshot = Readonly<{
  snapshotId: string;
  owner: CartOwner;
  items: readonly SelectedCartItem[];
}>;
export interface CartCheckoutPort {
  addItem(skuId: string, quantity: number): Promise<void>;
  refresh(): Promise<void>;
  captureCheckout(): Promise<CheckoutSnapshot>;
  getCheckoutSnapshot(snapshotId: string): CheckoutSnapshot | undefined;
  reconcileOrder(input: { orderId: string; snapshotId: string }): Promise<void>;
}
