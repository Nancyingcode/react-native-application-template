import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../src/core/http';
import type { Product } from '../src/modules/commerce/types';
import { useProduct, useProducts } from '../src/modules/commerce/useProducts';

const renderers: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(async () => {
  await act(async () => {
    renderers.splice(0).forEach(renderer => renderer.unmount());
  });
});

function product(id: string): Product {
  return {
    id,
    name: id,
    subtitle: '',
    description: '',
    category: '',
    imageUrl: '',
    priceMinor: 100,
    currency: 'CNY',
    inventory: null,
  };
}

function page(
  ids: string[],
  pageNumber = 1,
  pageSize = 20,
  total = ids.length,
) {
  return { items: ids.map(product), page: pageNumber, pageSize, total };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function renderHook<Value, Props>(
  hook: (props: Props) => Value,
  initialProps: Props,
) {
  let current!: Value;
  const renders: Value[] = [];
  function Harness({ value }: { value: Props }) {
    current = hook(value);
    renders.push(current);
    return null;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<Harness value={initialProps} />);
  });
  renderers.push(renderer);
  return {
    get current() {
      return current;
    },
    renders,
    async update(props: Props) {
      await act(async () => renderer.update(<Harness value={props} />));
    },
    async unmount() {
      await act(async () => renderer.unmount());
      renderers.splice(renderers.indexOf(renderer), 1);
    },
  };
}

describe('useProducts', () => {
  it('loads automatically, follows server pagination and deduplicates products', async () => {
    const first = deferred<ReturnType<typeof page>>();
    const second = deferred<ReturnType<typeof page>>();
    const repository = {
      listProducts: jest
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
        .mockResolvedValueOnce(page(['four'], 3, 2, 5)),
    };
    const monitor = { capture: jest.fn() };
    const hook = await renderHook(
      () => useProducts(repository, monitor),
      undefined,
    );

    expect(repository.listProducts).toHaveBeenCalledWith(1, 20);
    expect(hook.current.loading).toBe(true);
    expect(hook.current.products).toEqual([]);
    await act(async () => first.resolve(page(['one', 'two'], 1, 2, 5)));
    expect(hook.current.loading).toBe(false);
    expect(hook.current.hasMore).toBe(true);

    await act(async () => {
      hook.current.loadMore();
      hook.current.loadMore();
    });
    expect(repository.listProducts).toHaveBeenCalledTimes(2);
    expect(repository.listProducts).toHaveBeenLastCalledWith(2, 2);
    expect(hook.current.loadingMore).toBe(true);
    await act(async () => second.resolve(page(['two', 'three'], 2, 2, 5)));
    expect(hook.current.products.map(item => item.id)).toEqual([
      'one',
      'two',
      'three',
    ]);
    await act(async () => hook.current.loadMore());
    expect(repository.listProducts).toHaveBeenLastCalledWith(3, 2);
    expect(hook.current.products.map(item => item.id)).toEqual([
      'one',
      'two',
      'three',
      'four',
    ]);
    expect(hook.current.hasMore).toBe(false);
    await act(async () => hook.current.loadMore());
    expect(repository.listProducts).toHaveBeenCalledTimes(3);
  });

  it('refresh replaces pending pagination and prevents loading more until refreshed', async () => {
    const nextPage = deferred<ReturnType<typeof page>>();
    const refresh = deferred<ReturnType<typeof page>>();
    const repository = {
      listProducts: jest
        .fn()
        .mockResolvedValueOnce(page(['one'], 1, 1, 3))
        .mockReturnValueOnce(nextPage.promise)
        .mockReturnValueOnce(refresh.promise),
    };
    const monitor = { capture: jest.fn() };
    const hook = await renderHook(
      () => useProducts(repository, monitor),
      undefined,
    );
    await act(async () => hook.current.loadMore());
    await act(async () => hook.current.refresh());
    expect(hook.current.refreshing).toBe(true);
    expect(hook.current.loadingMore).toBe(false);
    expect(hook.current.products.map(item => item.id)).toEqual(['one']);
    expect(repository.listProducts).toHaveBeenLastCalledWith(1, 20);
    await act(async () => hook.current.loadMore());
    expect(repository.listProducts).toHaveBeenCalledTimes(3);
    await act(async () => refresh.resolve(page(['fresh'])));
    await act(async () => nextPage.resolve(page(['stale'], 2, 1, 3)));
    expect(hook.current.products.map(item => item.id)).toEqual(['fresh']);
    expect(hook.current.hasMore).toBe(false);
    expect(hook.current.error).toBe(false);
    expect(monitor.capture).not.toHaveBeenCalled();
  });

  it('allows retries after initial, pagination and refresh failures', async () => {
    const offline = new Error('offline');
    const repository = {
      listProducts: jest
        .fn()
        .mockRejectedValueOnce(offline)
        .mockResolvedValueOnce(page(['one'], 1, 1, 3))
        .mockRejectedValueOnce(offline)
        .mockResolvedValueOnce(page(['two'], 2, 1, 3))
        .mockRejectedValueOnce(offline)
        .mockResolvedValueOnce(page(['fresh'])),
    };
    const monitor = { capture: jest.fn() };
    const hook = await renderHook(
      () => useProducts(repository, monitor),
      undefined,
    );
    expect(hook.current).toMatchObject({
      loading: false,
      error: true,
      products: [],
    });
    await act(async () => hook.current.refresh());
    expect(hook.current.error).toBe(false);
    await act(async () => hook.current.loadMore());
    expect(hook.current).toMatchObject({
      loadingMore: false,
      error: true,
      hasMore: true,
    });
    await act(async () => hook.current.loadMore());
    expect(repository.listProducts).toHaveBeenLastCalledWith(2, 1);
    expect(hook.current.products.map(item => item.id)).toEqual(['one', 'two']);
    await act(async () => hook.current.refresh());
    expect(hook.current).toMatchObject({ refreshing: false, error: true });
    expect(hook.current.products.map(item => item.id)).toEqual(['one', 'two']);
    await act(async () => hook.current.refresh());
    expect(hook.current.products.map(item => item.id)).toEqual(['fresh']);
    expect(hook.current.error).toBe(false);
    expect(monitor.capture).toHaveBeenCalledTimes(3);
  });

  it('ignores superseded errors and completion after unmount', async () => {
    const old = deferred<ReturnType<typeof page>>();
    const latest = deferred<ReturnType<typeof page>>();
    const repository = {
      listProducts: jest
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(latest.promise),
    };
    const monitor = { capture: jest.fn() };
    const hook = await renderHook(
      () => useProducts(repository, monitor),
      undefined,
    );
    await act(async () => hook.current.refresh());
    await act(async () => old.reject(new Error('old request failed')));
    expect(hook.current.loading).toBe(true);
    expect(hook.current.error).toBe(false);
    await hook.unmount();
    const renderCount = hook.renders.length;
    await act(async () => latest.reject(new Error('unmounted')));
    expect(hook.renders).toHaveLength(renderCount);
    expect(monitor.capture).not.toHaveBeenCalled();
  });
});

describe('useProduct', () => {
  it('hides old details on the first render after an ID change', async () => {
    const next = deferred<Product>();
    const repository = {
      getProduct: jest
        .fn()
        .mockResolvedValueOnce(product('one'))
        .mockReturnValueOnce(next.promise),
    };
    const monitor = { capture: jest.fn() };
    const hook = await renderHook(
      id => useProduct(repository, monitor, id),
      'one',
    );
    expect(hook.current.product?.id).toBe('one');
    const renderCount = hook.renders.length;
    await hook.update('two');
    expect(hook.renders[renderCount]).toMatchObject({
      product: undefined,
      loading: true,
    });
    await act(async () => next.resolve(product('two')));
    expect(hook.current).toMatchObject({
      product: product('two'),
      loading: false,
    });
    expect(repository.getProduct).toHaveBeenLastCalledWith('two');
  });

  it('ignores an old detail response after switching IDs', async () => {
    const old = deferred<Product>();
    const repository = {
      getProduct: jest
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(product('two')),
    };
    const monitor = { capture: jest.fn() };
    const hook = await renderHook(
      id => useProduct(repository, monitor, id),
      'one',
    );
    await hook.update('two');
    await act(async () => old.resolve(product('one')));
    expect(hook.current.product?.id).toBe('two');
  });

  it.each([404, 409])('treats HTTP %s as unavailable', async status => {
    const repository = {
      getProduct: jest
        .fn()
        .mockRejectedValue(
          new ApiError('unavailable', status, 'PRODUCT_UNAVAILABLE'),
        ),
    };
    const monitor = { capture: jest.fn() };
    const hook = await renderHook(
      () => useProduct(repository, monitor, 'one'),
      undefined,
    );
    expect(hook.current).toMatchObject({
      product: undefined,
      loading: false,
      error: false,
      unavailable: true,
    });
    expect(monitor.capture).toHaveBeenCalledTimes(1);
  });

  it('retries network failures without declaring the product unavailable', async () => {
    const repository = {
      getProduct: jest
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(product('one')),
    };
    const monitor = { capture: jest.fn() };
    const hook = await renderHook(
      () => useProduct(repository, monitor, 'one'),
      undefined,
    );
    expect(hook.current).toMatchObject({
      loading: false,
      error: true,
      unavailable: false,
    });
    await act(async () => hook.current.retry());
    expect(hook.current).toMatchObject({
      product: product('one'),
      loading: false,
      error: false,
    });
    expect(repository.getProduct).toHaveBeenCalledTimes(2);
  });

  it('handles a missing ID immediately and ignores work after unmount', async () => {
    const pending = deferred<Product>();
    const repository = {
      getProduct: jest.fn().mockReturnValue(pending.promise),
    };
    const monitor = { capture: jest.fn() };
    const hook = await renderHook<
      ReturnType<typeof useProduct>,
      string | undefined
    >(id => useProduct(repository, monitor, id), undefined);
    expect(hook.current).toMatchObject({
      loading: false,
      error: false,
      unavailable: true,
    });
    await act(async () => hook.current.retry());
    expect(repository.getProduct).not.toHaveBeenCalled();
    await hook.update('one');
    expect(hook.current.loading).toBe(true);
    await hook.update(undefined);
    expect(hook.current).toMatchObject({
      product: undefined,
      loading: false,
      unavailable: true,
    });
    await hook.unmount();
    const renderCount = hook.renders.length;
    await act(async () => pending.reject(new Error('unmounted')));
    expect(hook.renders).toHaveLength(renderCount);
    expect(monitor.capture).not.toHaveBeenCalled();
  });
});
