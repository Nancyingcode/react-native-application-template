import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogRepository, SearchFilter, SearchPage } from './api';

export function useSearch(
  repository: Pick<CatalogRepository, 'search'>,
  filter: SearchFilter | null,
) {
  const key = JSON.stringify(filter);
  const request = useRef(0);
  const active = useRef(false);
  const [state, setState] = useState<{
    key: string;
    data: SearchPage;
    loading: boolean;
    error: boolean;
  }>({
    key,
    data: { items: [], page: 0, pageSize: 20, total: 0 },
    loading: false,
    error: false,
  });

  const load = useCallback(
    async (page: number) => {
      if (key === 'null') {
        return;
      }
      const id = ++request.current;
      active.current = true;
      setState(previous => ({
        key,
        loading: true,
        error: false,
        data:
          page === 1
            ? { items: [], page: 0, pageSize: 20, total: 0 }
            : previous.data,
      }));
      try {
        const result = await repository.search(JSON.parse(key), page, 20);
        if (id !== request.current) {
          return;
        }
        setState(previous => ({
          key,
          loading: false,
          error: false,
          data: {
            ...result,
            items:
              page === 1
                ? result.items
                : [
                    ...new Map(
                      [...previous.data.items, ...result.items].map(item => [
                        item.productId,
                        item,
                      ]),
                    ).values(),
                  ],
          },
        }));
      } catch {
        if (id === request.current) {
          setState(previous => ({ ...previous, loading: false, error: true }));
        }
      } finally {
        if (id === request.current) {
          active.current = false;
        }
      }
    },
    [key, repository],
  );

  useEffect(() => {
    load(1);
    return () => {
      request.current += 1;
      active.current = false;
    };
  }, [load]);

  const current = state.key === key;
  const hasMore =
    current && state.data.page * state.data.pageSize < state.data.total;
  return {
    items: current ? state.data.items : [],
    loading: !current || state.loading,
    error: current && state.error,
    hasMore,
    refresh: () => load(1),
    loadMore: () => {
      if (hasMore && !active.current) {
        load(state.data.page + 1);
      }
    },
  };
}
