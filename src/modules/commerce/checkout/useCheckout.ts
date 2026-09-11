import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SkuCartStore } from '../cart/SkuCartStore';
import type { CheckoutPort, PricingSummary } from './contracts';
import { copyPricingInput } from './api';
import { ApiError } from '../../../core/http';
import {
  validateShippingAddress,
  type ShippingAddressDraft,
  type ShippingAddressErrors,
} from './shippingAddress';

export function useCheckout(
  checkout: CheckoutPort,
  cart: SkuCartStore,
  snapshotId: string,
  translate: (key: string) => string,
) {
  const owner = useSyncExternalStore(cart.subscribe, cart.getSnapshot).owner;
  const snapshot = cart.getCheckoutSnapshot(snapshotId);
  const validSnapshot =
    !!snapshot &&
    owner.userId !== null &&
    snapshot.owner.userId === owner.userId &&
    snapshot.owner.generation === owner.generation;
  const [address, setAddress] = useState<ShippingAddressDraft>({});
  const [errors, setErrors] = useState<ShippingAddressErrors>({});
  const [couponId, setCouponId] = useState<string>();
  const [pricing, setPricing] = useState<PricingSummary>();
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const revision = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    revision.current++;
    setAddress({});
    setErrors({});
    setCouponId(undefined);
    setPricing(undefined);
    setError(undefined);
    setBusy(false);
    setChanged(false);
  }, [owner, snapshotId]);

  const selectCoupon = (id?: string) => {
    revision.current++;
    setCouponId(id);
    setPricing(undefined);
    setError(undefined);
    setBusy(false);
    setChanged(false);
  };
  const preview = async () => {
    if (!validSnapshot || !snapshot) {
      return;
    }
    const validation = validateShippingAddress(address, translate);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    const request = ++revision.current;
    const current = () =>
      mounted.current &&
      revision.current === request &&
      cart.getSnapshot().owner === owner &&
      cart.getCheckoutSnapshot(snapshotId) === snapshot;
    setBusy(true);
    setError(undefined);
    try {
      const result = await checkout.preview(
        copyPricingInput({ items: snapshot.items, couponId }),
      );
      if (!current()) {
        return;
      }
      setChanged(
        !!pricing && JSON.stringify(result) !== JSON.stringify(pricing),
      );
      setPricing(result);
    } catch (cause) {
      if (!current()) {
        return;
      }
      setPricing(undefined);
      setChanged(false);
      setError(checkoutErrorKey(cause));
    } finally {
      if (current()) {
        setBusy(false);
      }
    }
  };
  return {
    validSnapshot,
    snapshot,
    address,
    setAddress,
    errors,
    couponId,
    selectCoupon,
    pricing,
    changed,
    busy,
    error,
    preview,
  };
}

export function checkoutErrorKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (
      [
        'INSUFFICIENT_STOCK',
        'INVENTORY_RESERVATION_FAILED',
        'SKU_INACTIVE',
        'PRODUCT_INACTIVE',
        'SKU_NOT_FOUND',
        'INVENTORY_NOT_FOUND',
        'PRODUCT_NOT_FOUND',
      ].includes(error.code)
    ) {
      return 'commerce.checkout.stockError';
    }
    if (['COUPON_NOT_AVAILABLE', 'COUPON_NOT_FOUND'].includes(error.code)) {
      return 'commerce.checkout.couponError';
    }
    if (
      ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_IN_PROGRESS'].includes(error.code)
    ) {
      return 'commerce.checkout.conflictError';
    }
  }
  return 'commerce.checkout.requestError';
}
