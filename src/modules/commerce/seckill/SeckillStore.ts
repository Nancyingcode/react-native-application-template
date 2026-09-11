import type { SessionManager } from '../../../core/auth';
import { AuthenticationRequiredError } from '../../../core/http';
import {
  validateShippingAddress,
  type ShippingAddressDraft,
} from '../checkout/shippingAddress';
import { getActivityPhase, getQuantityLimit } from './state';
import type {
  SeckillActivity,
  SeckillPort,
  SeckillPricePresenter,
  SeckillToken,
} from './types';

export type Submission =
  | { status: 'sending' }
  | { status: 'unknown' }
  | { status: 'queued'; requestId: string };
export interface SeckillState {
  generation: number;
  userId: string | null;
  activity?: SeckillActivity;
  busy: boolean;
  tokenReady: boolean;
  error?: string;
  submissions: Readonly<Record<string, Submission>>;
}

export class SeckillStore {
  private state: SeckillState;
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;
  private scope = 0;
  private activeId?: string;
  private tokenValue?: SeckillToken;
  private disposed = false;
  // 没有查询/幂等协议，模块存活期间保留账号与 SKU 的发送记录，离页不能解锁重发。
  private ledger = new Map<string, Submission>();

  constructor(
    private readonly repository: SeckillPort,
    private readonly session: SessionManager,
    readonly presentPrice: SeckillPricePresenter = () => undefined,
    private readonly now: () => number = Date.now,
  ) {
    this.state = {
      generation: 0,
      userId: session.getSnapshot()?.userId ?? null,
      busy: false,
      tokenReady: false,
      submissions: {},
    };
    this.unsubscribe = session.subscribe(() => {
      const userId = session.getSnapshot()?.userId ?? null;
      if (userId === this.state.userId) {
        return;
      }
      this.leave();
      this.state = {
        generation: this.state.generation + 1,
        userId,
        busy: false,
        tokenReady: false,
        submissions: {},
      };
      this.emit();
    });
  }
  getSnapshot = (): SeckillState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(): void {
    this.listeners.forEach(listener => listener());
  }
  private publish(patch: Partial<SeckillState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }
  private key(skuId: string): string {
    return JSON.stringify([this.state.userId, this.activeId, skuId]);
  }
  private entries(activity: SeckillActivity): Record<string, Submission> {
    return Object.fromEntries(
      activity.skus.flatMap(sku => {
        const entry = this.ledger.get(this.key(sku.skuId));
        return entry ? [[sku.skuId, entry]] : [];
      }),
    );
  }
  private current(scope: number): boolean {
    return !this.disposed && scope === this.scope && !!this.activeId;
  }
  leave(): void {
    this.scope += 1;
    this.tokenValue = undefined;
    this.activeId = undefined;
    for (const [key, entry] of this.ledger) {
      if (entry.status === 'sending') {
        this.ledger.set(key, { status: 'unknown' });
      }
    }
    this.publish({
      activity: undefined,
      busy: false,
      tokenReady: false,
      error: undefined,
      submissions: {},
    });
  }
  dispose(): void {
    this.leave();
    this.disposed = true;
    this.unsubscribe();
    this.listeners.clear();
    this.ledger.clear();
  }
  async open(activityId: string): Promise<void> {
    this.leave();
    if (this.disposed) {
      return;
    }
    if (!activityId.trim()) {
      this.publish({ error: 'loadFailed' });
      return;
    }
    this.activeId = activityId;
    const scope = this.scope;
    if (!this.state.userId) {
      return;
    }
    this.publish({ busy: true });
    try {
      const activity = await this.repository.get(activityId);
      if (this.current(scope)) {
        this.publish({ activity, submissions: this.entries(activity) });
      }
    } catch {
      if (this.current(scope)) {
        this.publish({ error: 'loadFailed' });
      }
    } finally {
      if (this.current(scope)) {
        this.publish({ busy: false });
      }
    }
  }
  async acquireToken(): Promise<void> {
    const activity = this.state.activity;
    if (
      this.disposed ||
      this.state.busy ||
      !activity ||
      getActivityPhase(activity, this.now()) !== 'active'
    ) {
      return;
    }
    if (!this.session.getSnapshot()) {
      throw new AuthenticationRequiredError();
    }
    const scope = this.scope;
    this.tokenValue = undefined;
    this.publish({ busy: true, tokenReady: false, error: undefined });
    try {
      const token = await this.repository.token(activity.id);
      if (!this.current(scope)) {
        return;
      }
      if (Date.parse(token.expiresAt) <= this.now()) {
        this.publish({ error: 'tokenExpired' });
        return;
      }
      this.tokenValue = token;
      this.publish({ tokenReady: true });
    } catch {
      if (this.current(scope)) {
        this.publish({ error: 'tokenFailed' });
      }
    } finally {
      if (this.current(scope)) {
        this.publish({ busy: false });
      }
    }
  }
  tick(): void {
    if (
      this.tokenValue &&
      Date.parse(this.tokenValue.expiresAt) <= this.now()
    ) {
      this.tokenValue = undefined;
      this.publish({ tokenReady: false, error: 'tokenExpired' });
    }
  }
  async submit(
    skuId: string,
    quantity: number,
    draft: ShippingAddressDraft,
  ): Promise<void> {
    const activity = this.state.activity;
    const token = this.tokenValue;
    if (this.disposed || this.state.busy || !activity || !this.activeId) {
      return;
    }
    const sku = activity.skus.find(item => item.skuId === skuId);
    const address = validateShippingAddress(draft);
    const canParticipate =
      sku &&
      getActivityPhase(activity, this.now()) === 'active' &&
      Number.isInteger(quantity) &&
      quantity >= 1 &&
      quantity <= getQuantityLimit(sku);
    if (!canParticipate || !address.valid) {
      this.publish({ error: 'invalidInput' });
      return;
    }
    if (!this.presentPrice(sku)) {
      this.publish({ error: 'priceUnknown' });
      return;
    }
    const key = this.key(skuId);
    if (this.ledger.has(key)) {
      return;
    }
    if (!token || Date.parse(token.expiresAt) <= this.now()) {
      this.tokenValue = undefined;
      this.publish({ tokenReady: false, error: 'tokenExpired' });
      return;
    }
    if (!this.session.getSnapshot()) {
      throw new AuthenticationRequiredError();
    }
    const scope = this.scope;
    this.ledger.set(key, { status: 'sending' });
    this.tokenValue = undefined;
    this.publish({
      busy: true,
      tokenReady: false,
      error: undefined,
      submissions: this.entries(activity),
    });
    try {
      const receipt = await this.repository.request(activity.id, skuId, {
        token: token.token,
        quantity,
        shippingAddress: address.value,
      });
      if (!this.current(scope)) {
        return;
      }
      this.ledger.set(key, { status: 'queued', requestId: receipt.requestId });
    } catch {
      // 未声明错误的副作用边界；任何发送后失败均不能证明未入队，不开放自动/手动重放。
      if (!this.disposed) {
        this.ledger.set(key, { status: 'unknown' });
      }
    } finally {
      if (this.current(scope)) {
        this.publish({ busy: false, submissions: this.entries(activity) });
      }
    }
  }
}
