import type { SkuCartStore } from '../cart/SkuCartStore';
import type { CheckoutInput, CheckoutPort } from './contracts';
import { copyCheckoutInput } from './api';
import { OrderSubmission } from './OrderSubmission';

/** 装配时创建一次；保存同一账号生命周期内的未决意图，不持久化收货隐私。 */
export class CheckoutOrderStore {
  private operations = new Map<
    string,
    { fingerprint: string; operation: OrderSubmission }
  >();
  private owner;
  private unsubscribe: () => void;
  private disposed = false;
  constructor(
    private readonly checkout: CheckoutPort,
    private readonly cart: SkuCartStore,
  ) {
    this.owner = cart.getSnapshot().owner;
    this.unsubscribe = cart.subscribe(() => {
      const owner = cart.getSnapshot().owner;
      if (
        owner.userId === this.owner.userId &&
        owner.generation === this.owner.generation
      ) {
        return;
      }
      this.clear();
      this.owner = owner;
    });
  }
  prepare(
    snapshotId: string,
    intent: Pick<CheckoutInput, 'couponId' | 'shippingAddress'>,
  ): OrderSubmission {
    if (this.disposed) {
      throw new Error('Checkout store disposed');
    }
    const hasOtherUnresolvedOrder = [...this.operations].some(
      ([id, entry]) =>
        id !== snapshotId &&
        ['sending', 'unknown', 'conflict'].includes(
          entry.operation.getStatus(),
        ),
    );
    if (hasOtherUnresolvedOrder) {
      throw new Error('Resolve existing checkout before changing snapshot');
    }
    const snapshot = this.cart.getCheckoutSnapshot(snapshotId);
    const validSnapshot =
      snapshot &&
      this.owner.userId !== null &&
      snapshot.owner.userId === this.owner.userId &&
      snapshot.owner.generation === this.owner.generation;
    if (!validSnapshot) {
      throw new Error('Checkout snapshot expired');
    }
    const input = copyCheckoutInput({ ...intent, items: snapshot.items });
    const fingerprint = JSON.stringify(input);
    const previous = this.operations.get(snapshotId);
    if (previous) {
      if (previous.fingerprint === fingerprint) {
        return previous.operation;
      }
      const status = previous.operation.getStatus();
      const canReplaceIntent = status === 'ready' || status === 'rejected';
      // 网络未知、处理中或幂等冲突都可能已有订单，不能换地址/券后换键重下。
      if (!canReplaceIntent) {
        throw new Error('Resolve existing checkout before changing intent');
      }
      previous.operation.deactivate();
    }
    const operation = new OrderSubmission(
      this.checkout,
      input,
      this.owner,
      () => this.cart.getSnapshot().owner,
      this.cart,
      snapshotId,
    );
    this.operations.set(snapshotId, { fingerprint, operation });
    return operation;
  }
  private clear(): void {
    this.operations.forEach(({ operation }) => operation.deactivate());
    this.operations.clear();
  }
  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
    this.clear();
  }
}
