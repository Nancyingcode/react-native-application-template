import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { createSkuCheckoutScreen } from '../src/modules/commerce/checkout/CheckoutScreen';
import { ShippingAddressForm } from '../src/modules/commerce/checkout/ShippingAddressForm';
import { PrimaryButton } from '../src/modules/commerce/shared/ui';
import { SkuCartStore } from '../src/modules/commerce/cart/SkuCartStore';
import { CartRepository } from '../src/modules/commerce/cart/repository';
import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import type { HttpClient } from '../src/core/http';
import { checkoutTranslations } from '../src/modules/commerce/checkout/translations';
import type { CouponSelectionProps } from '../src/modules/commerce/coupons/contracts';

const mockNavigate = jest.fn();
let mockSnapshotId = '';
jest.mock('../src/app/navigation', () => ({
  useAppNavigation: () => mockNavigate,
  useRouteParams: () => ({ snapshotId: mockSnapshotId }),
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
          primary: '#1464e5',
          border: '#ccc',
          danger: '#b00',
        },
      },
    },
    services: { i18n: { t: (key: string) => key } },
  }),
}));
const skuId = '11111111-1111-4111-8111-111111111111';
const summary = {
  originalAmount: '10.00',
  promotionDiscountAmount: '0',
  couponDiscountAmount: '0',
  shippingAmount: '0',
  shippingDiscountAmount: '0',
  discountAmount: '0',
  payableAmount: '10.00',
};
const address = {
  recipient: 'A',
  phone: '123',
  province: 'P',
  city: 'C',
  addressLine: 'Road',
};
function CouponSelector(_props: CouponSelectionProps) {
  return null;
}
async function setup() {
  const session = new SessionManager(new InMemorySessionStore());
  await session.setSession({
    userId: 'A',
    accessToken: 'test',
    expiresAt: Date.now() + 60000,
    permissions: [],
  });
  const request = jest.fn().mockResolvedValue({
    data: {
      userId: 'A',
      items: [
        {
          id: skuId,
          skuId,
          productId: skuId,
          productName: 'Product',
          skuName: 'SKU',
          quantity: 1,
          selected: true,
          currentPrice: '10.00',
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
  const cart = new SkuCartStore(
    new CartRepository({ request } as unknown as HttpClient),
    session,
  );
  mockSnapshotId = (await cart.captureCheckout()).snapshotId;
  const checkout = {
    preview: jest.fn().mockResolvedValue(summary),
    create: jest.fn(),
  };
  const Screen = createSkuCheckoutScreen(checkout, cart, CouponSelector);
  let tree!: Renderer.ReactTestRenderer;
  await act(async () => {
    tree = Renderer.create(<Screen />);
  });
  const preview = () =>
    tree.root
      .findAllByType(PrimaryButton)
      .find(button => button.props.label === 'commerce.checkout.preview')!;
  const fill = async () => {
    await act(async () => {
      tree.root.findByType(ShippingAddressForm).props.onChange(address);
    });
  };
  return { tree, checkout, cart, session, preview, fill };
}
afterEach(() => {
  mockNavigate.mockClear();
});
it('renders labelled fields and validates before preview, retaining unknown-unit submit blocker', async () => {
  const { tree, checkout, preview, fill, cart } = await setup();
  expect(tree.root.findAllByType(TextInput)).toHaveLength(7);
  await act(async () => {
    preview().props.onPress();
  });
  expect(checkout.preview).not.toHaveBeenCalled();
  expect(
    Object.keys(tree.root.findByType(ShippingAddressForm).props.errors),
  ).toHaveLength(5);
  await fill();
  await act(async () => {
    preview().props.onPress();
  });
  expect(checkout.preview).toHaveBeenCalledWith({
    items: [{ skuId, quantity: 1 }],
  });
  expect(
    tree.root
      .findAllByType(PrimaryButton)
      .find(button => button.props.label === 'commerce.checkout.submit')?.props
      .disabled,
  ).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain(
    'commerce.checkout.amountUnconfirmed',
  );
  expect(checkout.create).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
  cart.dispose();
});
it('discards a stale coupon preview and requires a fresh pricing result', async () => {
  const { tree, checkout, preview, fill, cart } = await setup();
  await fill();
  let finish!: (value: typeof summary) => void;
  checkout.preview.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await act(async () => {
    preview().props.onPress();
  });
  await act(async () => {
    tree.root.findByType(CouponSelector).props.onChange({ couponId: skuId });
    finish(summary);
  });
  expect(JSON.stringify(tree.toJSON())).not.toContain('10.00');
  await act(async () => {
    preview().props.onPress();
  });
  expect(checkout.preview).toHaveBeenLastCalledWith({
    items: [{ skuId, quantity: 1 }],
    couponId: skuId,
  });
  await act(async () => tree.unmount());
  cart.dispose();
});
it('clears private form state and ignores late pricing after account change', async () => {
  const { tree, checkout, preview, fill, cart, session } = await setup();
  await fill();
  let finish!: (value: typeof summary) => void;
  checkout.preview.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await act(async () => {
    preview().props.onPress();
  });
  await act(async () => {
    await session.signOut();
    finish(summary);
  });
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).toContain(
    'commerce.checkout.snapshotExpired',
  );
  expect(mockNavigate).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
  cart.dispose();
});
it('ignores pending preview after unmount', async () => {
  const { tree, checkout, preview, fill, cart } = await setup();
  await fill();
  let finish!: (value: typeof summary) => void;
  checkout.preview.mockImplementation(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await act(async () => {
    preview().props.onPress();
  });
  await act(async () => {
    tree.unmount();
    finish(summary);
  });
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(checkout.create).not.toHaveBeenCalled();
  cart.dispose();
});
it('keeps both translation catalogs complete', () => {
  expect(Object.keys(checkoutTranslations['zh-CN']).sort()).toEqual(
    Object.keys(checkoutTranslations['en-US']).sort(),
  );
});

it('marks changed prices and clears stale pricing when revalidation fails', async () => {
  const { tree, checkout, preview, fill, cart } = await setup();
  await fill();
  await act(async () => {
    preview().props.onPress();
  });
  checkout.preview.mockResolvedValueOnce({
    ...summary,
    payableAmount: '11.00',
  });
  await act(async () => {
    preview().props.onPress();
  });
  expect(JSON.stringify(tree.toJSON())).toContain(
    'commerce.checkout.priceChanged',
  );
  checkout.preview.mockRejectedValueOnce(new Error('offline'));
  await act(async () => {
    preview().props.onPress();
  });
  expect(JSON.stringify(tree.toJSON())).toContain(
    'commerce.checkout.requestError',
  );
  expect(JSON.stringify(tree.toJSON())).not.toContain('11.00');
  await act(async () => tree.unmount());
  cart.dispose();
});
