import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useCouponsClient } from './context';
import type { CouponStatus, UserCoupon } from './repository';

export function useCoupons(mode: 'my' | 'available', status?: CouponStatus) {
  const client = useCouponsClient();
  const owner = useSyncExternalStore(client.subscribe, client.getGeneration);
  const sequence = useRef(0);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{
    owner: number;
    mode: string;
    status?: CouponStatus;
    items: readonly UserCoupon[];
    loading: boolean;
    error: boolean;
  }>({ owner, mode, status, items: [], loading: true, error: false });
  useEffect(() => {
    const request = ++sequence.current;
    setResult({ owner, mode, status, items: [], loading: true, error: false });
    client.query(mode, status).then(
      items => {
        if (sequence.current === request && client.getGeneration() === owner) {
          setResult({
            owner,
            mode,
            status,
            items,
            loading: false,
            error: false,
          });
        }
      },
      () => {
        if (sequence.current === request && client.getGeneration() === owner) {
          setResult({
            owner,
            mode,
            status,
            items: [],
            loading: false,
            error: true,
          });
        }
      },
    );
    return () => {
      sequence.current += 1;
    };
  }, [client, owner, mode, status, reload]);
  const current =
    result.owner === owner && result.mode === mode && result.status === status;
  return {
    items: current ? result.items : [],
    loading: !current || result.loading,
    error: current && result.error,
    authenticated: client.isAuthenticated(),
    refresh: useCallback(() => setReload(value => value + 1), []),
  };
}
