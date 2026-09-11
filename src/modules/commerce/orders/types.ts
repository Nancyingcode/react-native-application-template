export interface OrderResponseDto {
  id: string;
  orderNo: string;
  userId: string;
  status: string;
  currency: string;
  subtotalAmount: string;
  originalAmount: string;
  promotionDiscountAmount: string;
  couponDiscountAmount: string;
  discountAmount: string;
  shippingAmount: string;
  shippingDiscountAmount: string;
  taxAmount: string;
  totalAmount: string;
  payableAmount: string;
  paidAmount: string;
  refundedAmount: string;
  paymentStatus: string | null;
  paymentSummary: OrderPaymentSummaryResponseDto | null;
  shippingAddress: ShippingAddressDto;
  expiresAt: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  closedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItemResponseDto[];
  statusTimeline: OrderStatusLogResponseDto[];
}
export interface OrderItemResponseDto {
  id: string;
  productId: string;
  skuId: string;
  skuCode: string;
  productName: string;
  productImage: string | null;
  skuName: string;
  attributes: Record<string, unknown>;
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  originalUnitPrice: string;
  saleUnitPrice: string;
  promotionDiscountAmount: string;
  couponDiscountAmount: string;
  finalAmount: string;
}
export interface OrderPaymentSummaryResponseDto {
  id: string;
  paymentNo: string;
  provider: string;
  status: string;
  amount: string;
  paidAt: string | null;
}
export interface OrderStatusLogResponseDto {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  operatorType: string;
  operatorId: string | null;
  reason: string | null;
  createdAt: string;
}
export interface ShippingAddressDto {
  recipient: string;
  phone: string;
  province: string;
  city: string;
  district?: string;
  addressLine: string;
  postalCode?: string;
}
export interface OrderPageResponseDto {
  items: OrderResponseDto[];
  page: number;
  pageSize: number;
  total: number;
}
export interface ReceiptResponseDto {
  id: string;
  orderNo: string;
  userId: string;
  status: string;
  currency: string;
  subtotalAmount: string;
  originalAmount: string;
  promotionDiscountAmount: string;
  couponDiscountAmount: string;
  discountAmount: string;
  shippingAmount: string;
  shippingDiscountAmount: string;
  taxAmount: string;
  totalAmount: string;
  payableAmount: string;
  paidAmount: string;
  refundedAmount: string;
  clientRequestId: string | null;
  requestFingerprint: string | null;
  shippingAddress: Record<string, unknown>;
  expiresAt: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  closedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
