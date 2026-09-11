export type CouponChoice = Readonly<{ couponId: string }> | null;

export interface CouponSelectionProps {
  value: CouponChoice;
  disabled?: boolean;
  onChange(value: CouponChoice): void;
}
