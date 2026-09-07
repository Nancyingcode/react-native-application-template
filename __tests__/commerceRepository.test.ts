import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { MemoryCache } from '../src/core/cache';
import { ApiError, HttpClient } from '../src/core/http';
import { ConsoleLogger } from '../src/core/logger';
import { CommerceRepository } from '../src/modules/commerce/repository';

const productResponse = {
  id: '019934ba-7437-7000-8000-000000000001',
  categoryId: '019934ba-7437-7000-8000-000000000002',
  categoryName: '数码配件',
  name: '无线充电器',
  slug: 'wireless-charger',
  description: '适配常见无线充电设备',
  status: 'ACTIVE',
  basePrice: '129.0000',
  currency: 'CNY',
  version: 1,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

function successResponse(data: unknown): Response {
  return new Response(
    JSON.stringify({
      code: 'SUCCESS',
      message: 'OK',
      data,
      requestId: 'request-1',
      timestamp: '2026-09-01T00:00:00Z',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function createRepository() {
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const cache = new MemoryCache();
  const logger = new ConsoleLogger({ scope: 'test' });
  jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  const http = new HttpClient({
    baseUrl: 'http://localhost:3000',
    timeoutMs: 1000,
    session: new SessionManager(new InMemorySessionStore()),
    cache,
    logger,
    fetcher,
  });
  return { repository: new CommerceRepository(http), fetcher, cache };
}

describe('CommerceRepository products', () => {
  it('requests the default public product page and unwraps pagination metadata', async () => {
    const { repository, fetcher } = createRepository();
    fetcher.mockResolvedValue(
      successResponse({
        items: [productResponse],
        page: 1,
        pageSize: 20,
        total: 42,
      }),
    );

    await expect(repository.listProducts()).resolves.toEqual({
      items: [
        {
          id: productResponse.id,
          name: '无线充电器',
          subtitle: '',
          description: '适配常见无线充电设备',
          category: '数码配件',
          imageUrl: '',
          priceMinor: 12900,
          currency: 'CNY',
          inventory: null,
        },
      ],
      page: 1,
      pageSize: 20,
      total: 42,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/products?page=1&pageSize=20',
      expect.objectContaining({ authenticated: false }),
    );
    expect(fetcher.mock.calls[0][1]?.headers).toBeInstanceOf(Headers);
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).has('Authorization'),
    ).toBe(false);
  });

  it('passes explicit pagination and preserves an empty page', async () => {
    const { repository, fetcher } = createRepository();
    fetcher.mockResolvedValue(
      successResponse({ items: [], page: 3, pageSize: 10, total: 20 }),
    );

    await expect(repository.listProducts(3, 10)).resolves.toEqual({
      items: [],
      page: 3,
      pageSize: 10,
      total: 20,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/products?page=3&pageSize=10',
      expect.any(Object),
    );
  });

  it('encodes the detail ID and maps nullable display fields without inventing stock', async () => {
    const { repository, fetcher } = createRepository();
    const id = '商品/one?variant=1';
    fetcher.mockResolvedValue(
      successResponse({
        ...productResponse,
        id,
        description: null,
        subtitle: null,
        mainImage: null,
        images: null,
      }),
    );

    await expect(repository.getProduct(id)).resolves.toMatchObject({
      id,
      description: '',
      subtitle: '',
      imageUrl: '',
      inventory: null,
    });
    expect(fetcher).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/products/${encodeURIComponent(id)}`,
      expect.objectContaining({ authenticated: false }),
    );
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).has('Authorization'),
    ).toBe(false);
  });

  it.each([
    [
      'https://images.example.test/main.jpg',
      'https://images.example.test/main.jpg',
    ],
    [null, 'https://images.example.test/gallery.jpg'],
    ['', 'https://images.example.test/gallery.jpg'],
  ])(
    'uses the main image or the first gallery image (%s)',
    async (mainImage, expected) => {
      const { repository, fetcher } = createRepository();
      fetcher.mockResolvedValue(
        successResponse({
          ...productResponse,
          subtitle: '轻巧便携',
          mainImage,
          images: ['https://images.example.test/gallery.jpg'],
        }),
      );

      await expect(
        repository.getProduct(productResponse.id),
      ).resolves.toMatchObject({
        subtitle: '轻巧便携',
        imageUrl: expected,
      });
    },
  );

  it.each([
    ['0', 0],
    ['129.0000', 12900],
    ['0.1', 10],
    ['1.0049', 100],
    ['1.005', 101],
    ['9.9999', 1000],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ])(
    'converts decimal basePrice %s to %i minor units',
    async (basePrice, priceMinor) => {
      const { repository, fetcher } = createRepository();
      fetcher.mockResolvedValue(
        successResponse({ ...productResponse, basePrice }),
      );

      await expect(
        repository.getProduct(productResponse.id),
      ).resolves.toMatchObject({
        priceMinor,
      });
    },
  );

  it.each([
    '',
    'abc',
    '-1.00',
    'NaN',
    'Infinity',
    '1e3',
    ' 1.00 ',
    '1.2.3',
    null,
    129,
  ])(
    'rejects invalid prices instead of displaying a zero price (%s)',
    async basePrice => {
      const { repository, fetcher } = createRepository();
      fetcher.mockResolvedValue(
        successResponse({ ...productResponse, basePrice }),
      );

      await expect(repository.getProduct(productResponse.id)).rejects.toThrow(
        'Invalid product basePrice',
      );
    },
  );

  it.each([
    '90071992547409.92',
    '90071992547409.915',
    '99999999999999999999999',
  ])(
    'rejects prices exceeding safe integer minor units (%s)',
    async basePrice => {
      const { repository, fetcher } = createRepository();
      fetcher.mockResolvedValue(
        successResponse({ ...productResponse, basePrice }),
      );

      await expect(repository.getProduct(productResponse.id)).rejects.toThrow(
        'Product basePrice exceeds the safe integer range',
      );
    },
  );

  it('propagates a missing product response with its backend error code', async () => {
    const { repository, fetcher } = createRepository();
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'PRODUCT_NOT_FOUND', message: '商品不存在' }),
        { status: 404, headers: { 'X-Request-Id': 'request-not-found' } },
      ),
    );

    await expect(repository.getProduct('missing')).rejects.toEqual(
      new ApiError('商品不存在', 404, 'PRODUCT_NOT_FOUND', 'request-not-found'),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('propagates network failures after the HTTP client retries', async () => {
    const { repository, fetcher } = createRepository();
    const failure = new TypeError('Network request failed');
    fetcher.mockRejectedValue(failure);

    await expect(repository.listProducts()).rejects.toBe(failure);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('fetches fresh list and detail data on repeated reads', async () => {
    const { repository, fetcher, cache } = createRepository();
    const cacheRead = jest.spyOn(cache, 'get');
    const updatedProduct = { ...productResponse, basePrice: '99.0000' };
    fetcher
      .mockResolvedValueOnce(
        successResponse({
          items: [productResponse],
          page: 1,
          pageSize: 20,
          total: 1,
        }),
      )
      .mockResolvedValueOnce(
        successResponse({
          items: [updatedProduct],
          page: 1,
          pageSize: 20,
          total: 1,
        }),
      )
      .mockResolvedValueOnce(successResponse(productResponse))
      .mockResolvedValueOnce(successResponse(updatedProduct));

    expect((await repository.listProducts()).items[0].priceMinor).toBe(12900);
    expect((await repository.listProducts()).items[0].priceMinor).toBe(9900);
    expect((await repository.getProduct(productResponse.id)).priceMinor).toBe(
      12900,
    );
    expect((await repository.getProduct(productResponse.id)).priceMinor).toBe(
      9900,
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(cacheRead).not.toHaveBeenCalled();
  });
});
