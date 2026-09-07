import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../core/http';
import type { Monitor } from '../../core/telemetry';
import type { CommerceRepository } from './repository';
import type { Product } from './types';

type ProductsPhase = 'idle' | 'loading' | 'refreshing' | 'loadingMore';

interface ProductsState {
  products: Product[];
  phase: ProductsPhase;
  error: boolean;
  page: number;
  pageSize: number;
  total: number;
}

const initialProductsState: ProductsState = {
  products: [],
  phase: 'loading',
  error: false,
  page: 0,
  pageSize: 20,
  total: 0,
};

export function useProducts(
  repository: Pick<CommerceRepository, 'listProducts'>,
  monitor: Pick<Monitor, 'capture'>,
) {
  const [state, setState] = useState(initialProductsState);
  const request = useRef({ id: 0, active: false, mounted: false });

  const load = useCallback(
    async (
      page: number,
      pageSize: number,
      phase: Exclude<ProductsPhase, 'idle'>,
    ): Promise<void> => {
      if (!request.current.mounted) {
        return;
      }
      const requestId = ++request.current.id;
      request.current.active = true;
      const isCurrentRequest = () =>
        request.current.mounted && request.current.id === requestId;
      setState(current => ({
        ...(phase === 'loading' ? initialProductsState : current),
        phase,
        error: false,
      }));
      try {
        const result = await repository.listProducts(page, pageSize);
        if (!isCurrentRequest()) {
          return;
        }
        setState(current => {
          const products =
            phase === 'loadingMore'
              ? [...current.products, ...result.items]
              : result.items;
          return {
            products: [
              ...new Map(products.map(item => [item.id, item])).values(),
            ],
            phase: 'idle',
            error: false,
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
          };
        });
      } catch (error) {
        if (!isCurrentRequest()) {
          return;
        }
        monitor.capture(error, { scope: 'commerce.products', page });
        setState(current => ({ ...current, phase: 'idle', error: true }));
      } finally {
        if (isCurrentRequest()) {
          request.current.active = false;
        }
      }
    },
    [monitor, repository],
  );

  useEffect(() => {
    const currentRequest = request.current;
    currentRequest.mounted = true;
    load(1, initialProductsState.pageSize, 'loading');
    return () => {
      currentRequest.mounted = false;
      currentRequest.id += 1;
      currentRequest.active = false;
    };
  }, [load]);

  const refresh = useCallback(() => {
    const phase = state.products.length === 0 ? 'loading' : 'refreshing';
    // 刷新替换整个商品集合，先前分页请求不能再追加到新的列表。
    load(1, initialProductsState.pageSize, phase);
  }, [load, state.products.length]);

  const hasMore = state.page * state.pageSize < state.total;
  const loadMore = useCallback(() => {
    const canLoadMore = hasMore && !request.current.active;
    if (canLoadMore) {
      load(state.page + 1, state.pageSize, 'loadingMore');
    }
  }, [hasMore, load, state.page, state.pageSize]);

  return {
    products: state.products,
    loading: state.phase === 'loading',
    refreshing: state.phase === 'refreshing',
    loadingMore: state.phase === 'loadingMore',
    error: state.error,
    hasMore,
    refresh,
    loadMore,
  };
}

interface ProductState {
  productId: string | undefined;
  product: Product | undefined;
  status: 'loading' | 'ready' | 'error' | 'unavailable';
}

export function useProduct(
  repository: Pick<CommerceRepository, 'getProduct'>,
  monitor: Pick<Monitor, 'capture'>,
  productId: string | undefined,
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ProductState>({
    productId,
    product: undefined,
    status: productId ? 'loading' : 'unavailable',
  });

  useEffect(() => {
    setState({
      productId,
      product: undefined,
      status: productId ? 'loading' : 'unavailable',
    });
    if (!productId) {
      return;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const product = await repository.getProduct(productId);
        if (!cancelled) {
          setState({ productId, product, status: 'ready' });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        const unavailable =
          error instanceof ApiError &&
          (error.status === 404 || error.status === 409);
        monitor.capture(error, { scope: 'commerce.product', productId });
        setState({
          productId,
          product: undefined,
          status: unavailable ? 'unavailable' : 'error',
        });
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [attempt, monitor, productId, repository]);

  const retry = useCallback(() => {
    if (productId) {
      setAttempt(current => current + 1);
    }
  }, [productId]);

  // 路由先于请求 effect 更新，商品 ID 不匹配时立即隐藏旧数据。
  const isCurrentProduct = state.productId === productId;
  const loading =
    Boolean(productId) && (!isCurrentProduct || state.status === 'loading');
  const unavailable =
    !productId || (isCurrentProduct && state.status === 'unavailable');

  return {
    product: isCurrentProduct && productId ? state.product : undefined,
    loading,
    error: isCurrentProduct && state.status === 'error',
    unavailable,
    retry,
  };
}
