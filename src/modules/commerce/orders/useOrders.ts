import { useEffect, useRef, useState } from 'react';
import type { SessionManager } from '../../../core/auth';
import { ApiError } from '../../../core/http';
import { createIdempotencyKey } from '../shared/idempotency';
import type { OrderFilter, OrdersRepository } from './repository';
import type { OrderResponseDto } from './types';

export function useOrders(
  repository: OrdersRepository,
  session: SessionManager,
  orderId?: string,
) {
  const [state, setState] = useState({
    items: [] as OrderResponseDto[],
    order: undefined as OrderResponseDto | undefined,
    busy: false,
    error: '',
    page: 0,
    total: 0,
    blocked: false,
  });
  const generation = useRef(0);
  const active = useRef(false);
  const busy = useRef(false);
  const filter = useRef<OrderFilter>({});
  const cancelKey = useRef<string | undefined>(undefined);
  const current = useRef(state);
  current.current = state;

  async function load(nextFilter = filter.current, more = false) {
    if (!active.current || (more && busy.current)) {
      return;
    }
    const ticket = ++generation.current;
    const page = more ? current.current.page + 1 : 1;
    filter.current = nextFilter;
    busy.current = true;
    setState(previous => ({
      ...previous,
      busy: true,
      error: '',
      ...(!more && !orderId ? { items: [], page: 0, total: 0 } : {}),
    }));
    try {
      if (orderId !== undefined) {
        const order = await repository.get(orderId);
        if (active.current && ticket === generation.current) {
          setState(previous => ({
            ...previous,
            order,
            blocked: repository.isActionBlocked(order.id),
            error: repository.isActionBlocked(order.id) ? 'unknownResult' : '',
          }));
        }
      } else {
        const result = await repository.list(nextFilter, page);
        if (active.current && ticket === generation.current) {
          setState(previous => ({
            ...previous,
            items: more
              ? [
                  ...new Map(
                    [...previous.items, ...result.items].map(item => [
                      item.id,
                      item,
                    ]),
                  ).values(),
                ]
              : result.items,
            page: result.page,
            total: result.total,
          }));
        }
      }
    } catch {
      if (active.current && ticket === generation.current) {
        setState(previous => ({
          ...previous,
          error: 'loadError',
          order: undefined,
        }));
      }
    } finally {
      if (active.current && ticket === generation.current) {
        busy.current = false;
        setState(previous => ({ ...previous, busy: false }));
      }
    }
  }

  async function mutate(action: 'cancel' | 'receipt') {
    const order = current.current.order;
    const allowed =
      action === 'cancel'
        ? order?.status === 'PENDING_PAYMENT'
        : order?.status === 'SHIPPED';
    if (
      !active.current ||
      busy.current ||
      current.current.blocked ||
      !order ||
      !allowed
    ) {
      return;
    }
    busy.current = true;
    const ticket = ++generation.current;
    setState(previous => ({ ...previous, busy: true, error: '' }));
    let error = '';
    let blocked = false;
    try {
      if (action === 'cancel') {
        cancelKey.current ??= createIdempotencyKey();
        await repository.cancel(order.id, {
          idempotencyKey: cancelKey.current,
        });
      } else {
        await repository.confirmReceipt(order.id);
      }
    } catch (failure) {
      // 无法证明副作用未发生时只允许核对，离页重进也不会自动重放请求。
      blocked = !(
        failure instanceof ApiError &&
        failure.status >= 400 &&
        failure.status < 500 &&
        failure.status !== 408
      );
      error = blocked ? 'unknownResult' : 'actionError';
    }
    if (!active.current || ticket !== generation.current) {
      return;
    }
    try {
      const fresh = await repository.get(order.id);
      if (active.current && ticket === generation.current) {
        setState(previous => ({
          ...previous,
          order: fresh,
          error,
          blocked: blocked && repository.isActionBlocked(order.id),
        }));
      }
    } catch {
      if (active.current && ticket === generation.current) {
        setState(previous => ({
          ...previous,
          order: undefined,
          error: 'unknownResult',
          blocked: true,
        }));
      }
    } finally {
      if (active.current && ticket === generation.current) {
        busy.current = false;
        setState(previous => ({ ...previous, busy: false }));
      }
    }
  }

  useEffect(() => {
    active.current = true;
    const invalidate = () => {
      generation.current++;
    };
    let owner = session.getSnapshot()?.userId;
    const unsubscribe = session.subscribe(() => {
      const next = session.getSnapshot()?.userId;
      if (next === owner) {
        return;
      }
      owner = next;
      generation.current++;
      busy.current = false;
      cancelKey.current = undefined;
      setState({
        items: [],
        order: undefined,
        busy: false,
        error: '',
        page: 0,
        total: 0,
        blocked: false,
      });
      if (next) {
        load();
      }
    });
    load();
    return () => {
      active.current = false;
      invalidate();
      unsubscribe();
    };
    // 每个页面实例持有独立请求代次；筛选通过 load 显式提交。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository, session, orderId]);
  return { ...state, load, mutate };
}
