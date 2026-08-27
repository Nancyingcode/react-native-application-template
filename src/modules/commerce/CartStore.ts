import { useSyncExternalStore } from 'react';
import type { CartLine, Product } from './types';

export interface CartSnapshot {
  lines: CartLine[];
  itemCount: number;
  totalMinor: number;
}

const EMPTY_SNAPSHOT: CartSnapshot = { lines: [], itemCount: 0, totalMinor: 0 };

export class CartStore {
  private quantities = new Map<
    string,
    { product: Product; quantity: number }
  >();
  private listeners = new Set<() => void>();
  private snapshot = EMPTY_SNAPSHOT;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CartSnapshot => this.snapshot;

  add(product: Product, quantity = 1): void {
    const current = this.quantities.get(product.id)?.quantity ?? 0;
    this.setQuantity(product, current + quantity);
  }

  setQuantity(product: Product, quantity: number): void {
    const next = Math.max(0, Math.min(product.inventory, Math.floor(quantity)));
    if (next === 0) {
      this.quantities.delete(product.id);
    } else {
      this.quantities.set(product.id, { product, quantity: next });
    }
    this.publish();
  }

  clear(): void {
    if (this.quantities.size === 0) {
      return;
    }
    this.quantities.clear();
    this.publish();
  }

  private publish(): void {
    const lines = [...this.quantities.values()];
    this.snapshot = {
      lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      totalMinor: lines.reduce(
        (sum, line) => sum + line.product.priceMinor * line.quantity,
        0,
      ),
    };
    this.listeners.forEach(listener => listener());
  }
}

export function useCart(store: CartStore): CartSnapshot {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
