import { useSyncExternalStore } from 'react';
import type { SessionManager } from '../../../core/auth';
import { ApiError, AuthenticationRequiredError } from '../../../core/http';
import type {
  CartCheckoutPort,
  CartOwner,
  CheckoutSnapshot,
} from './contracts';
import {
  assertId,
  assertQuantity,
  CartRepository,
  type ServerCart,
  type ServerCartItem,
} from './repository';

export type MergeStatus =
  | 'pending'
  | 'sending'
  | 'confirmed'
  | 'unknown'
  | 'failed';
export interface GuestItem {
  skuId: string;
  productId: string;
  name: string;
  quantity: number;
  selected: boolean;
}
export interface MergeProgress {
  skuId: string;
  userId: string;
  quantity: number;
  status: MergeStatus;
}
export interface SkuCartState {
  owner: CartOwner;
  items: readonly ServerCartItem[];
  guests: readonly GuestItem[];
  merge: readonly MergeProgress[];
  busy: boolean;
  error: string | null;
}

export class SkuCartStore implements CartCheckoutPort {
  private listeners = new Set<() => void>();
  private guests: GuestItem[] = [];
  private progress: MergeProgress[] = [];
  private snapshots = new Map<string, CheckoutSnapshot>();
  private sequence = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private state: SkuCartState;
  private unsubscribe: () => void;

  constructor(
    private readonly repository: CartRepository,
    session: SessionManager,
  ) {
    this.state = {
      owner: Object.freeze({
        userId: session.getSnapshot()?.userId ?? null,
        generation: 0,
      }),
      items: [],
      guests: [],
      merge: [],
      busy: false,
      error: null,
    };
    this.unsubscribe = session.subscribe(() => {
      const userId = session.getSnapshot()?.userId ?? null;
      if (userId === this.state.owner.userId) {
        return;
      }
      // 排队中的旧账号操作必须失效；发送中的合并无法根据数量证明是否成功。
      this.progress.forEach(entry => {
        if (entry.status === 'sending') {
          entry.status = 'unknown';
        }
      });
      this.snapshots.clear();
      this.publish({
        owner: Object.freeze({
          userId,
          generation: this.state.owner.generation + 1,
        }),
        items: [],
        busy: false,
        error: null,
      });
    });
  }
  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = (): SkuCartState => this.state;
  private publish(patch: Partial<SkuCartState> = {}): void {
    this.state = {
      ...this.state,
      ...patch,
      guests: this.guests.map(item => Object.freeze({ ...item })),
      merge: this.progress
        .filter(
          item => item.userId === (patch.owner ?? this.state.owner).userId,
        )
        .map(item => Object.freeze({ ...item })),
    };
    this.listeners.forEach(listener => listener());
  }
  private check(owner: CartOwner): void {
    if (owner !== this.state.owner) {
      throw new Error('Cart account changed');
    }
  }
  private run<T>(action: (owner: CartOwner) => Promise<T>): Promise<T> {
    const owner = this.state.owner;
    const result = this.queue.then(async () => {
      this.check(owner);
      this.publish({ busy: true, error: null });
      try {
        return await action(owner);
      } catch (error) {
        if (owner === this.state.owner) {
          this.publish({ error: 'commerce.cart.operationFailed' });
        }
        throw error;
      } finally {
        if (owner === this.state.owner) {
          this.publish({ busy: false });
        }
      }
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
  private accept(owner: CartOwner, cart: ServerCart): void {
    this.check(owner);
    if (cart.userId !== owner.userId) {
      throw new Error('Cart owner mismatch');
    }
    this.publish({ items: cart.items.map(item => Object.freeze({ ...item })) });
  }
  private async read(owner: CartOwner): Promise<void> {
    this.check(owner);
    if (owner.userId) {
      this.accept(owner, await this.repository.get());
    }
  }
  refresh = (): Promise<void> => this.run(owner => this.read(owner));
  private async mutate(
    owner: CartOwner,
    action: () => Promise<ServerCart>,
  ): Promise<void> {
    this.check(owner);
    try {
      this.accept(owner, await action());
    } catch (error) {
      // 累加请求绝不自动重放；刷新失败也必须保留原始提交失败。
      if (owner === this.state.owner) {
        await this.read(owner).catch(() => undefined);
      }
      throw error;
    }
  }
  addItem = (skuId: string, quantity: number): Promise<void> =>
    this.run(async owner => {
      assertId(skuId);
      assertQuantity(quantity);
      if (owner.userId) {
        await this.mutate(owner, () => this.repository.add(skuId, quantity));
        return;
      }
      if (
        this.progress.some(
          entry => entry.skuId === skuId && entry.status !== 'confirmed',
        )
      ) {
        throw new Error('Resolve the previous merge before editing this SKU');
      }
      const sku = await this.repository.getSku(skuId);
      this.check(owner);
      if (sku.status !== 'ACTIVE') {
        throw new Error('SKU is unavailable');
      }
      const existing = this.guests.find(item => item.skuId === skuId);
      const next = (existing?.quantity ?? 0) + quantity;
      assertQuantity(next);
      if (existing) {
        existing.quantity = next;
      } else {
        this.guests.push({
          skuId,
          productId: sku.productId,
          name: sku.name,
          quantity,
          selected: true,
        });
      }
      this.publish();
    });
  updateItem(
    id: string,
    patch: { quantity?: number; selected?: boolean },
  ): Promise<void> {
    const update = { ...patch };
    return this.run(async owner => {
      if (update.quantity !== undefined) {
        assertQuantity(update.quantity);
      }
      if (owner.userId) {
        await this.mutate(owner, () => this.repository.update(id, update));
      } else {
        this.assertGuestEditable(id);
        const item = this.guests.find(entry => entry.skuId === id);
        if (!item) {
          throw new Error('Guest item not found');
        }
        Object.assign(item, update);
        this.publish();
      }
    });
  }
  private assertGuestEditable(skuId: string): void {
    if (
      this.progress.some(
        entry => entry.skuId === skuId && entry.status !== 'confirmed',
      )
    ) {
      throw new Error('Resolve the previous merge before editing this SKU');
    }
  }
  removeItems(ids: readonly string[]): Promise<void> {
    const copied = [...ids];
    return this.run(async owner => {
      if (owner.userId) {
        await this.mutate(owner, () =>
          copied.length === 1
            ? this.repository.remove(copied[0])
            : this.repository.removeMany(copied),
        );
      } else {
        copied.forEach(id => this.assertGuestEditable(id));
        this.guests = this.guests.filter(item => !copied.includes(item.skuId));
        this.publish();
      }
    });
  }
  selectItems(ids: readonly string[], selected: boolean): Promise<void> {
    const copied = [...ids];
    return this.run(async owner => {
      if (owner.userId) {
        await this.mutate(owner, () =>
          this.repository.select(copied, selected),
        );
      } else {
        copied.forEach(id => this.assertGuestEditable(id));
        this.guests.forEach(item => {
          if (copied.includes(item.skuId)) {
            item.selected = selected;
          }
        });
        this.publish();
      }
    });
  }
  clear(): Promise<void> {
    return this.run(async owner => {
      if (owner.userId) {
        await this.mutate(owner, () => this.repository.clear());
      } else {
        this.guests.forEach(item => this.assertGuestEditable(item.skuId));
        this.guests = [];
        this.publish();
      }
    });
  }
  confirmGuestMerge(): Promise<void> {
    return this.run(async owner => {
      if (!owner.userId) {
        throw new AuthenticationRequiredError();
      }
      await this.read(owner);
      for (const guest of [...this.guests]) {
        this.check(owner);
        let entry = this.progress.find(
          item => item.skuId === guest.skuId && item.status !== 'confirmed',
        );
        if (
          entry &&
          (entry.userId !== owner.userId || entry.status === 'unknown')
        ) {
          continue;
        }
        if (!entry) {
          entry = {
            skuId: guest.skuId,
            quantity: guest.quantity,
            userId: owner.userId,
            status: 'pending',
          };
          this.progress.push(entry);
        }
        entry.status = 'sending';
        this.publish();
        try {
          await this.mutate(owner, () =>
            this.repository.add(guest.skuId, guest.quantity),
          );
          entry.status = 'confirmed';
          this.guests = this.guests.filter(item => item !== guest);
          this.publish();
        } catch (error) {
          const rejected =
            error instanceof AuthenticationRequiredError ||
            (error instanceof ApiError &&
              [400, 401, 403, 404, 409, 422, 429].includes(error.status));
          entry.status = rejected ? 'failed' : 'unknown';
          this.publish();
          throw error;
        }
      }
    });
  }
  resolveUnknownMerge(
    skuId: string,
    decision: 'already-added' | 'retry',
  ): Promise<void> {
    return this.run(async owner => {
      const entry = this.progress.find(
        item =>
          item.skuId === skuId &&
          item.userId === owner.userId &&
          item.status === 'unknown',
      );
      if (!entry) {
        throw new Error('Unknown merge not found');
      }
      await this.read(owner);
      // 这是用户核对后的显式决定，不以数量相同推断精确一次。
      entry.status = decision === 'retry' ? 'pending' : 'confirmed';
      if (decision === 'already-added') {
        this.guests = this.guests.filter(item => item.skuId !== skuId);
      }
      this.publish();
    });
  }
  captureCheckout = (): Promise<CheckoutSnapshot> =>
    this.run(async owner => {
      if (!owner.userId) {
        throw new AuthenticationRequiredError();
      }
      await this.read(owner);
      const items = this.state.items
        .filter(
          item =>
            item.selected &&
            item.valid &&
            item.saleable &&
            item.inStock &&
            item.available >= item.quantity &&
            item.quantity <= 99,
        )
        .map(item =>
          Object.freeze({
            skuId: item.skuId,
            productId: item.productId,
            cartItemId: item.id,
            quantity: item.quantity,
          }),
        );
      if (!items.length || items.length > 50) {
        throw new Error('Select 1 to 50 valid cart items');
      }
      const snapshot = Object.freeze({
        snapshotId: `cart-${owner.generation}-${++this.sequence}`,
        owner,
        items: Object.freeze(items),
      });
      this.snapshots.set(snapshot.snapshotId, snapshot);
      return snapshot;
    });
  getCheckoutSnapshot = (snapshotId: string): CheckoutSnapshot | undefined =>
    this.snapshots.get(snapshotId);
  reconcileOrder = (input: {
    orderId: string;
    snapshotId: string;
  }): Promise<void> =>
    this.run(async owner => {
      assertId(input.orderId);
      if (!this.snapshots.has(input.snapshotId)) {
        throw new Error('Checkout snapshot expired');
      }
      // 显式 items 下单后的服务端清理规则未冻结；仅刷新，绝不盲删或减去并发新增数量。
      await this.read(owner);
    });
}
export function useSkuCart(store: SkuCartStore): SkuCartState {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
