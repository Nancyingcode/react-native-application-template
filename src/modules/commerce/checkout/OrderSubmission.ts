import type { CartCheckoutPort, CartOwner } from '../cart/contracts';
import { ApiError } from '../../../core/http';
import { createIdempotencyKey } from '../shared/idempotency';
import type { CheckoutInput, CheckoutPort } from './contracts';
import { copyCheckoutInput } from './api';

export type OrderSubmissionStatus =
  | 'ready'
  | 'sending'
  | 'unknown'
  | 'conflict'
  | 'rejected'
  | 'created';

/** 每个实例代表一个已确认的下单意图；所属账号生命周期结束后不可继续使用。 */
export class OrderSubmission {
  readonly idempotencyKey: string;
  private readonly input: CheckoutInput;
  private inFlight?: Promise<{ orderId: string }>;
  private result?: { orderId: string };
  private status: OrderSubmissionStatus = 'ready';
  private active = true;
  private reconciled = false;
  constructor(
    private readonly checkout: CheckoutPort,
    input: CheckoutInput,
    private readonly owner: CartOwner,
    private readonly getOwner: () => CartOwner,
    private readonly cart: CartCheckoutPort,
    private readonly snapshotId: string,
    key = createIdempotencyKey(),
  ) {
    this.input = copyCheckoutInput(input);
    this.owner = { ...owner };
    this.idempotencyKey = key;
  }
  getStatus(): OrderSubmissionStatus {
    return this.status;
  }
  getResult(): { orderId: string } | undefined {
    this.assertOwner();
    return this.result && { ...this.result };
  }
  deactivate(): void {
    this.active = false;
  }
  activate(): void {
    this.assertOwner();
    this.active = true;
  }
  private assertOwner(): void {
    const current = this.getOwner();
    const sameOwner =
      this.owner.userId !== null &&
      current.userId === this.owner.userId &&
      current.generation === this.owner.generation;
    if (!sameOwner) {
      throw new Error('Checkout owner expired');
    }
  }
  submit(): Promise<{ orderId: string }> {
    this.assertOwner();
    if (!this.active) {
      return Promise.reject(new Error('Checkout is inactive'));
    }
    if (this.result) {
      return Promise.resolve({ ...this.result });
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    if (this.status === 'conflict' || this.status === 'rejected') {
      return Promise.reject(new Error('Checkout intent requires review'));
    }
    this.status = 'sending';
    this.inFlight = this.checkout
      .create(this.input, { idempotencyKey: this.idempotencyKey })
      .then(result => {
        this.assertOwner();
        // 离页后只保存本意图的结果，不更新购物车或导航；返回页面后显式恢复。
        this.result = { ...result };
        this.status = 'created';
        return { ...result };
      })
      .catch((error: unknown) => {
        this.assertOwner();
        if (
          error instanceof ApiError &&
          error.code === 'IDEMPOTENCY_CONFLICT'
        ) {
          this.status = 'conflict';
        } else if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 408 &&
          error.status !== 429 &&
          error.code !== 'IDEMPOTENCY_IN_PROGRESS'
        ) {
          this.status = 'rejected';
        } else {
          this.status = 'unknown';
        }
        throw error;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }
  async reconcile(): Promise<void> {
    this.assertOwner();
    if (!this.active || !this.result || this.reconciled) {
      return;
    }
    await this.cart.reconcileOrder({
      orderId: this.result.orderId,
      snapshotId: this.snapshotId,
    });
    this.assertOwner();
    this.reconciled = true;
  }
  continueToPayment(
    navigate: (route: 'CommercePayment', params: { orderId: string }) => void,
  ): void {
    this.assertOwner();
    if (this.active && this.result) {
      navigate('CommercePayment', { orderId: this.result.orderId });
    }
  }
}
