import { CartStore } from '../src/modules/commerce/CartStore';
import type { Product } from '../src/modules/commerce/types';

const product: Product = {
  id: 'product-1',
  name: 'Product',
  subtitle: 'Subtitle',
  description: 'Description',
  category: 'Category',
  imageUrl: 'https://example.test/product.png',
  priceMinor: 1299,
  currency: 'CNY',
  inventory: 2,
};

describe('CartStore', () => {
  it('derives item count and total from cart lines', () => {
    const cart = new CartStore();
    cart.add(product);
    cart.add(product);

    expect(cart.getSnapshot()).toEqual({
      lines: [{ product, quantity: 2 }],
      itemCount: 2,
      totalMinor: 2598,
    });
  });

  it('clamps quantity to inventory and removes zero quantity lines', () => {
    const cart = new CartStore();
    cart.setQuantity(product, 10);
    expect(cart.getSnapshot().lines[0].quantity).toBe(2);

    cart.setQuantity(product, 0);
    expect(cart.getSnapshot().lines).toEqual([]);
  });
});
