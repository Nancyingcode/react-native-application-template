import type { ShippingAddress } from '../checkout/shippingAddress';

export interface SeckillSku {
  id: string;
  activityId: string;
  skuId: string;
  seckillPrice: string;
  totalStock: number;
  availableStock: number;
  perUserLimit: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface SeckillActivity {
  id: string;
  name: string;
  status: string;
  startAt: string;
  endAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  skus: SeckillSku[];
}
export interface SeckillToken {
  token: string;
  expiresAt: string;
}
export interface SeckillRequest {
  token: string;
  quantity: number;
  shippingAddress: ShippingAddress;
}
export type SeckillReceipt = { status: 'QUEUED'; requestId: string };
export interface SeckillPort {
  list(): Promise<SeckillActivity[]>;
  get(activityId: string): Promise<SeckillActivity>;
  token(activityId: string): Promise<SeckillToken>;
  request(
    activityId: string,
    skuId: string,
    input: SeckillRequest,
  ): Promise<SeckillReceipt>;
}

// 只由已核实单位/币种的装配方提供；默认不把 Decimal 当成主币或分。
export type SeckillPricePresenter = (
  sku: Readonly<SeckillSku>,
) => string | undefined;
