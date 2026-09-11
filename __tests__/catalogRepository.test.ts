import { CatalogRepository } from '../src/modules/commerce/catalog/api';

const sku = { id: 'sku/a', productId: 'product/a', price: '199.0000' };
describe('catalog Swagger contract', () => {
  const request = jest.fn();
  const repository = new CatalogRepository({ request });
  beforeEach(() => request.mockReset());

  it('uses page search, encodes filters and retains numeric prices without inventing currency', async () => {
    const data = {
      items: [{ productId: 'p', salePrice: 1.005 }],
      page: 2,
      pageSize: 20,
      total: 21,
    };
    request.mockResolvedValue({ data });
    expect(
      await repository.search(
        {
          keyword: ' tea & milk ',
          category: 'a/b',
          sort: 'price_asc',
          priceMin: 0,
          priceMax: 20,
        },
        2,
      ),
    ).toBe(data);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      '/api/v1/search/products?keyword=tea%20%26%20milk&category=a%2Fb&sort=price_asc&priceMin=0&priceMax=20&page=2&pageSize=20',
      { authenticated: false },
    );
    expect(data.items[0]).not.toHaveProperty('priceMinor');
    expect(data.items[0]).not.toHaveProperty('currency');
  });

  it('rejects invalid filters before requesting', async () => {
    await expect(
      repository.search({ priceMin: 4, priceMax: 1 }),
    ).rejects.toThrow();
    await expect(repository.search({ priceMin: NaN })).rejects.toThrow();
    await expect(repository.search({}, 0)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('chooses only the product SKU path and preserves Decimal strings', async () => {
    request.mockResolvedValue({ data: [sku] });
    expect(await repository.listSkus('product/a')).toEqual([sku]);
    expect(request).toHaveBeenCalledWith('/api/v1/products/product%2Fa/skus', {
      authenticated: false,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects SKU identity mismatches', async () => {
    request.mockResolvedValue({ data: [sku] });
    await expect(repository.listSkus('another')).rejects.toThrow();
    request.mockResolvedValue({ data: sku });
    await expect(repository.getSku('another')).rejects.toThrow();
  });

  it('authenticates inventory and does not turn failure into zero stock', async () => {
    request.mockRejectedValue(new Error('unauthorized'));
    await expect(repository.inventory('sku/a')).rejects.toThrow('unauthorized');
    expect(request).toHaveBeenCalledWith('/api/v1/inventory/skus/sku%2Fa', {
      authenticated: true,
    });
    request.mockResolvedValue({ data: { skuId: 'sku/a', available: -1 } });
    await expect(repository.inventory('sku/a')).rejects.toThrow();
    request.mockResolvedValue({ data: { skuId: 'sku/a', available: 0 } });
    expect(await repository.inventory('sku/a')).toEqual({
      skuId: 'sku/a',
      available: 0,
    });
  });

  it('fetches hot words anonymously', async () => {
    request.mockResolvedValue({ data: [{ keyword: 'tea', count: 3 }] });
    expect(await repository.hot()).toEqual([{ keyword: 'tea', count: 3 }]);
    expect(request).toHaveBeenCalledWith('/api/v1/search/hot', {
      authenticated: false,
    });
  });
});
