import React from 'react';
import { FlatList, Text, TextInput } from 'react-native';
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
    return renderer.root
      .findAllByProps({
        accessibilityLabel: label,
        accessibilityRole: role,
      })
      .find(item => item.props.accessibilityState?.selected !== undefined)!
      .props.accessibilityState.selected;
  }

  async function press(
    label: string,
    role: 'button' | 'tab' | 'radio' = 'button',
  ) {
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

  it('connects SKU selection, guest merge, cart badges and the checkout boundary', async () => {
    const sku = {
      id: '8440fd60-f5e0-42ff-967c-2e9be0974f10',
      productId: product.id,
      name: 'Blue',
      skuCode: 'BLUE',
      attributes: {},
      price: '129.0000',
      originalPrice: null,
      currency: 'CNY',
      status: 'ACTIVE',
    };
    let quantity = 0;
    let unread = 1;
    const serverCart = () => ({
      userId: 'shopper-1',
      items: quantity
        ? [
            {
              id: '8440fd60-f5e0-42ff-967c-2e9be0974f11',
              skuId: sku.id,
              productId: product.id,
              productName: product.name,
              skuName: sku.name,
              quantity,
              selected: true,
              currentPrice: sku.price,
              currency: sku.currency,
              available: 10,
              saleable: true,
              inStock: true,
              valid: true,
              invalidReason: null,
            },
          ]
        : [],
    });
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url, options) => {
        if (String(url).endsWith(`/api/v1/products/${product.id}/skus`))
          return response([sku]);
        if (String(url).endsWith(`/api/v1/skus/${sku.id}`))
          return response(sku);
        if (String(url).endsWith('/api/v1/cart/items')) {
          expect(JSON.parse(String(options?.body))).toEqual({
            skuId: sku.id,
            quantity: 1,
          });
          quantity += 1;
          return response(serverCart());
        }
        if (String(url).endsWith('/api/v1/notifications/unread-count'))
          return response({ count: unread });
        if (String(url).includes('/api/v1/notifications/cursor'))
          return response({
            items: [
              {
                id: 'notice',
                userId: 'shopper-1',
                channel: 'IN_APP',
                title: 'Integration message',
                content: 'Hello',
                status: unread ? 'SENT' : 'READ',
                readAt: unread ? null : '2026-09-12',
                createdAt: '2026-09-12',
              },
            ],
            nextCursor: null,
          });
        if (String(url).endsWith('/api/v1/notifications/notice/read')) {
          unread = 0;
          return response({ id: 'notice', read: true });
        }
        if (String(url).endsWith('/api/v1/members/me'))
          return response({
            userId: 'shopper-1',
            createdAt: '2026-09-12',
            growthValue: 1,
            levelConfig: { name: 'Silver', freeShipping: false },
          });
        if (String(url).endsWith('/api/v1/points/account'))
          return response({
            userId: 'shopper-1',
            available: 1,
            frozen: 0,
            totalEarned: 1,
            totalSpent: 0,
          });
        if (String(url).endsWith('/api/v1/coupons/available'))
          return response([
            {
              id: '11111111-1111-4111-8111-111111111111',
              couponTemplateId: '22222222-2222-4222-8222-222222222222',
              name: 'Integration coupon',
              type: 'FIXED',
              status: 'AVAILABLE',
              validFrom: '2026-01-01',
              validUntil: '2027-01-01',
              orderId: null,
              unavailableReason: null,
            },
          ]);
        if (String(url).endsWith('/api/v1/pricing/preview')) {
          expect(JSON.parse(String(options?.body))).toEqual({
            items: [{ skuId: sku.id, quantity: 1 }],
            couponId: '11111111-1111-4111-8111-111111111111',
          });
          return response({
            originalAmount: '129',
            promotionDiscountAmount: '0',
            couponDiscountAmount: '9',
            shippingAmount: '0',
            shippingDiscountAmount: '0',
            discountAmount: '9',
            payableAmount: '120',
          });
        }
        if (String(url).endsWith('/api/v1/cart')) return response(serverCart());
        if (String(url).endsWith('/api/v1/auth/login')) {
          return response({
            user: { id: 'shopper-1' },
            tokens: {
              accessToken: 'shopper-access',
              refreshToken: 'shopper-refresh',
              tokenType: 'Bearer',
              accessExpiresInSeconds: 900,
              refreshExpiresInSeconds: 2592000,
            },
          });
        }
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
    expect(hasText('库存未知')).toBe(true);
    expect(selected('更多', 'tab')).toBe(true);
    await press('更多', 'tab');
    expect(selected('商城', 'button')).toBe(true);
    expect(selected('购物车', 'button')).toBe(false);
    await press('关闭');
    await act(async () =>
      renderer.root
        .findAllByProps({ accessibilityRole: 'radio' })
        .find(item => typeof item.props.onPress === 'function')!
        .props.onPress(),
    );
    await press('加入购物车');
    expect(
      fetcher.mock.calls.some(
        ([url]) =>
          String(url).includes('/inventory/') ||
          String(url).endsWith('/cart/items'),
      ),
    ).toBe(false);
    await press('更多', 'tab');
    await press('商城');
    await press('购物车，1 件商品');
    expect(hasText('Blue')).toBe(true);
    await press('登录', 'tab');
    const loginOption = renderer.root
      .findAllByProps({ testID: 'login-option-login.accountPassword' })
      .find(item => typeof item.props.onPress === 'function')!;
    await act(async () => loginOption.props.onPress());
    await act(async () => {
      renderer.root
        .findByProps({ testID: 'account-login-account' })
        .props.onChangeText('shopper@example.com');
      renderer.root
        .findByProps({ testID: 'account-login-password' })
        .props.onChangeText('shopper-password');
    });
    await act(async () => {
      await renderer.root
        .findByProps({ testID: 'account-login-submit' })
        .props.onPress();
    });
    await press('更多', 'tab');
    await press('购物车');
    expect(quantity).toBe(0);
    await press('确认合并 / 继续失败项');
    expect(quantity).toBe(1);
    await press('更多', 'tab');
    await press('商城');
    await press('购物车，1 件商品');
    await press('去结算');
    expect(hasText('确认订单')).toBe(true);
    await press('选择优惠券: Integration coupon', 'radio');
    for (const label of ['收货人', '联系电话', '省 / 州', '城市', '详细地址']) {
      await act(async () =>
        renderer.root
          .findAllByType(TextInput)
          .find(input => input.props.accessibilityLabel === label)!
          .props.onChangeText('Test'),
      );
    }
    await press('试算价格');
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).endsWith('/api/v1/pricing/preview'),
      ),
    ).toBe(true);
    expect(hasText('120')).toBe(true);
    expect(
      fetcher.mock.calls.some(
        ([url]) =>
          String(url).includes('/v1/commerce/') ||
          String(url).endsWith('/api/v1/orders'),
      ),
    ).toBe(false);
    expect(selected('更多', 'tab')).toBe(true);
    await press('更多', 'tab');
    expect(selected('购物车', 'button')).toBe(true);
    expect(selected('商城', 'button')).toBe(false);
    await press('会员与积分');
    await press('未读消息：1');
    expect(hasText('Integration message')).toBe(true);
    await press('标为已读：Integration message');
    expect(hasText('未读消息：0')).toBe(true);
    await press('更多', 'tab');
    await press('会员与积分');
    expect(hasText('未读消息：0')).toBe(true);
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
