import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { useSearch } from '../src/modules/commerce/catalog/useSearch';
import type {
  SearchFilter,
  SearchPage,
} from '../src/modules/commerce/catalog/api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
const page = (id: string, number = 1): SearchPage => ({
  items: [
    {
      productId: id,
      name: id,
      subtitle: null,
      categoryId: 'c',
      categoryName: 'Category',
      salePrice: 199,
      sales: 0,
      status: 'ACTIVE',
      createdAt: '',
    },
  ],
  page: number,
  pageSize: 20,
  total: 60,
});

it('discards old pagination after filters change and handles empty results and retries', async () => {
  const search = jest.fn().mockResolvedValue(page('first'));
  const repository = { search };
  let latest!: ReturnType<typeof useSearch>;
  function Harness({ filter }: { filter: SearchFilter }) {
    latest = useSearch(repository, filter);
    return null;
  }
  let renderer!: Renderer.ReactTestRenderer;
  await act(async () => {
    renderer = Renderer.create(<Harness filter={{ keyword: 'first' }} />);
  });
  const pending = deferred<SearchPage>();
  search.mockReturnValueOnce(pending.promise);
  act(() => {
    latest.loadMore();
    latest.loadMore();
  });
  expect(search).toHaveBeenCalledTimes(2);
  search.mockResolvedValueOnce({ items: [], page: 1, pageSize: 20, total: 0 });
  await act(async () => {
    renderer.update(<Harness filter={{ category: 'new', sort: 'sales' }} />);
  });
  await act(async () => pending.resolve(page('stale', 2)));
  expect(latest.items).toEqual([]);
  expect(latest.hasMore).toBe(false);
  expect(search).toHaveBeenLastCalledWith(
    { category: 'new', sort: 'sales' },
    1,
    20,
  );
  search.mockRejectedValueOnce(new Error('offline'));
  await act(async () => latest.refresh());
  expect(latest.error).toBe(true);
  search.mockResolvedValueOnce(page('retry'));
  await act(async () => latest.refresh());
  expect(latest.items[0].productId).toBe('retry');
  expect(latest.error).toBe(false);
  await act(async () => renderer.unmount());
});
