import React from 'react';
import { FlatList, Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
import { ConsoleLogger } from '../src/core/logger';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: React.PropsWithChildren) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const product = {
  id: '8440fd60-f5e0-42ff-967c-2e9be0974f0f',
  name: '营销测试商品',
  categoryName: '第三阶段示例',
  description: null,
  basePrice: '129.0000',
  currency: 'CNY',
};

function response(data: unknown) {
  return new Response(JSON.stringify({ code: 'SUCCESS', data }), {
    status: 200,
  });
}

describe('commerce screen integration', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  function hasText(text: string): boolean {
    return renderer.root
      .findAllByType(Text)
      .some(
        item =>
          typeof item.props.children === 'string' &&
          item.props.children.includes(text),
      );
  }

  function selected(label: string, role: 'button' | 'tab'): boolean {
    return renderer.root.findAllByProps({
      accessibilityLabel: label,
      accessibilityRole: role,
    })[0].props.accessibilityState.selected;
  }

  async function press(label: string, role: 'button' | 'tab' = 'button') {
    const button = renderer.root
      .findAllByProps({
        accessibilityLabel: label,
        accessibilityRole: role,
      })
      .find(item => typeof item.props.onPress === 'function');
    expect(button).toBeDefined();
    await act(async () => button!.props.onPress());
  }

  beforeEach(() => {
    jest.spyOn(ConsoleLogger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer.unmount());
    }
    jest.restoreAllMocks();
  });

  it('loads the catalog on entry, fetches details and adds a product with unknown stock', async () => {
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async url => {
        if (String(url).endsWith(`/api/v1/products/${product.id}`)) {
          return response(product);
        }
        if (String(url).includes('/api/v1/products?')) {
          return response({
            items: [product],
            page: 1,
            pageSize: 20,
            total: 1,
          });
        }
        return new Response(null, { status: 204 });
      });
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await press('商城');
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/products?page=1&pageSize=20',
      expect.any(Object),
    );
    expect(renderer.root.findByType(FlatList).props.data).toEqual([
      expect.objectContaining({
        id: product.id,
        priceMinor: 12900,
        inventory: null,
      }),
    ]);
    const card = renderer.root.findByProps({
      accessibilityHint: '查看商品详情',
      accessibilityRole: 'button',
    });
    await act(async () => card.props.onPress());
    expect(fetcher).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/products/${product.id}`,
      expect.any(Object),
    );
    expect(hasText('暂无商品介绍')).toBe(true);
    expect(hasText('图片暂不可用')).toBe(true);
    expect(hasText('库存')).toBe(false);
    expect(selected('更多', 'tab')).toBe(true);
    await press('更多', 'tab');
    expect(selected('商城', 'button')).toBe(true);
    expect(selected('购物车', 'button')).toBe(false);
    await press('关闭');
    await press('加入购物车');
    await press('已加入购物车 · 去结算');
    expect(hasText('共 1 件商品')).toBe(true);
    expect(hasText('129.00')).toBe(true);
    await press('去结算');
    expect(hasText('确认订单')).toBe(true);
    expect(selected('更多', 'tab')).toBe(true);
    await press('更多', 'tab');
    expect(selected('购物车', 'button')).toBe(true);
    expect(selected('商城', 'button')).toBe(false);
  });

  it('retries a failed initial request and displays a real empty catalog', async () => {
    let failed = true;
    jest.spyOn(global, 'fetch').mockImplementation(async url => {
      if (String(url).includes('/api/v1/products?')) {
        if (failed) {
          return new Response(JSON.stringify({ message: 'Unavailable' }), {
            status: 503,
          });
        }
        return response({ items: [], page: 1, pageSize: 20, total: 0 });
      }
      return new Response(null, { status: 204 });
    });
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    await press('商城');
    expect(hasText('商品加载失败')).toBe(true);
    expect(renderer.root.findByType(FlatList).props.data).toEqual([]);
    failed = false;
    await press('重试');
    expect(hasText('暂无上架商品')).toBe(true);
    expect(renderer.root.findByType(FlatList).props.data).toEqual([]);
  });
});
