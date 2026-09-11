import React from 'react';

import Renderer, { act } from 'react-test-renderer';
import { createSkuCartScreen } from '../src/modules/commerce/cart/SkuCartScreen';
import { SkuCartStore } from '../src/modules/commerce/cart/SkuCartStore';
import { CartRepository } from '../src/modules/commerce/cart/repository';
import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import type { HttpClient } from '../src/core/http';
import { cartTranslations } from '../src/modules/commerce/cart/translations';

const mockNavigate = jest.fn();
jest.mock('../src/app/navigation', () => ({
  useAppNavigation: () => mockNavigate,
}));
jest.mock('../src/app/ApplicationProvider', () => ({
  useApplication: () => ({
    brand: {
      theme: {
        colors: {
          background: '#fff',
          surface: '#fff',
          text: '#111',
          textMuted: '#444',
          border: '#ddd',
        },
      },
    },
    services: { i18n: { t: (key: string) => key } },
  }),
}));
it('requires confirmation before clearing and navigates with only an immutable snapshot ID', async () => {
  const session = new SessionManager(new InMemorySessionStore());
  await session.setSession({
    userId: 'A',
    accessToken: 'token',
    expiresAt: Date.now() + 60000,
    permissions: [],
  });
  const request = jest.fn().mockResolvedValue({
    data: {
      userId: 'A',
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          skuId: '22222222-2222-4222-8222-222222222222',
          productId: '33333333-3333-4333-8333-333333333333',
          productName: 'Product',
          skuName: 'SKU',
          quantity: 1,
          selected: true,
          currentPrice: '199.0000',
          currency: 'CNY',
          available: 2,
          valid: true,
          saleable: true,
          inStock: true,
          invalidReason: null,
        },
      ],
    },
  });
  const store = new SkuCartStore(
    new CartRepository({ request } as unknown as HttpClient),
    session,
  );
  const Screen = createSkuCartScreen(store);
  let renderer!: Renderer.ReactTestRenderer;
  await act(async () => {
    renderer = Renderer.create(<Screen />);
  });
  const press = async (key: string) => {
    const button = renderer.root
      .findAllByProps({ accessibilityLabel: key })
      .find(node => typeof node.props.onPress === 'function');
    expect(button).toBeDefined();
    await act(async () => {
      button!.props.onPress();
    });
  };
  await press('commerce.cart.clear');
  expect(
    request.mock.calls.some(([, options]) => options.method === 'DELETE'),
  ).toBe(false);
  await press('commerce.cart.cancel');
  await press('commerce.cart.checkout');
  const [route, params] = mockNavigate.mock.calls[0];
  expect(route).toBe('CommerceCheckout');
  expect(Object.keys(params)).toEqual(['snapshotId']);
  expect(store.getCheckoutSnapshot(params.snapshotId)).toBeDefined();
  await press('commerce.cart.clear');
  await press('commerce.cart.confirm');
  expect(
    request.mock.calls.some(([, options]) => options.method === 'DELETE'),
  ).toBe(true);
  const snapshot = store.getCheckoutSnapshot(params.snapshotId)!;
  let finish!: () => void;
  jest.spyOn(store, 'captureCheckout').mockReturnValueOnce(
    new Promise(resolve => {
      finish = () => resolve(snapshot);
    }),
  );
  await press('commerce.cart.checkout');
  await act(async () => renderer.unmount());
  await act(async () => finish());
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  store.dispose();
});
it('provides the same translation keys for Chinese and English', () => {
  expect(Object.keys(cartTranslations['zh-CN']).sort()).toEqual(
    Object.keys(cartTranslations['en-US']).sort(),
  );
});

it('does not claim an empty cart while loading or after a failed read', async () => {
  const session = new SessionManager(new InMemorySessionStore());
  await session.setSession({
    userId: 'A',
    accessToken: 'token',
    permissions: [],
    expiresAt: Date.now() + 60000,
  });
  let rejectRead!: (error: Error) => void;
  const request = jest.fn().mockReturnValueOnce(
    new Promise((_, reject) => {
      rejectRead = reject;
    }),
  );
  const store = new SkuCartStore(
    new CartRepository({ request } as unknown as HttpClient),
    session,
  );
  const Screen = createSkuCartScreen(store);
  let renderer!: Renderer.ReactTestRenderer;
  await act(async () => {
    renderer = Renderer.create(<Screen />);
  });
  const empty = () =>
    renderer.root.findAllByProps({ children: 'commerce.cart.empty.title' });
  expect(empty()).toHaveLength(0);
  await act(async () => rejectRead(new Error('offline')));
  expect(empty()).toHaveLength(0);
  request.mockResolvedValue({ data: { userId: 'A', items: [] } });
  await act(async () => {
    await store.refresh();
  });
  expect(empty().length).toBeGreaterThan(0);
  await act(async () => renderer.unmount());
  store.dispose();
});
