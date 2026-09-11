import type { SessionManager } from '../../../core/auth';
import { ApiError, AuthenticationRequiredError } from '../../../core/http';
import type { OrdersPort } from '../orders/contracts';
import { createIdempotencyKey } from '../shared/idempotency';
import type {
  AfterSaleEntry,
  AfterSaleInput,
  AfterSalesPort,
  RefundInput,
} from './contracts';
import { AfterSaleValidationError, validateInput } from './validation';

export type ApplicationIntent =
  | { flow: 'refund'; input: RefundInput }
  | { flow: 'afterSale'; input: AfterSaleInput };
type Phase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'checking'
  | 'submitting'
  | 'success'
  | 'unknown'
  | 'conflict'
  | 'error'
  | 'signedOut';
export interface AfterSalesState {
  phase: Phase;
  entry?: AfterSaleEntry;
  orderStatus?: string;
  maxQuantity?: number;
  intent?: ApplicationIntent;
  result?: { id: string; status: string };
  error?: 'load' | 'invalid' | 'rejected';
  requestId?: string;
}
interface Operation {
  intent: ApplicationIntent;
  key: string;
}

/** 在模块生命周期内持有申请结果，返回页面不会创建第二条流程。 */
export class AfterSalesStore {
  private state: AfterSalesState = { phase: 'idle' };
  private listeners = new Set<() => void>();
  private records = new Map<
    string,
    { state: AfterSalesState; operation?: Operation }
  >();
  private operation?: Operation;
  private generation = 0;
  private userId: string | null;
  private unsubscribe: () => void;

  constructor(
    private readonly port: AfterSalesPort,
    private readonly orders: OrdersPort,
    private readonly session: SessionManager,
    private readonly newKey = createIdempotencyKey,
  ) {
    this.userId = session.getSnapshot()?.userId ?? null;
    this.unsubscribe = session.subscribe(() => {
      const userId = session.getSnapshot()?.userId ?? null;
      if (userId === this.userId) {
        return;
      }
      this.userId = userId;
      this.generation += 1;
      this.records.clear();
      this.operation = undefined;
      this.publish({ phase: 'signedOut' });
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  dispose() {
    this.generation += 1;
    this.unsubscribe();
    this.records.clear();
    this.listeners.clear();
  }

  private publish(state: AfterSalesState) {
    this.state = state;
    if (state.entry) {
      this.records.set(this.recordKey(state.entry), {
        state,
        operation: this.operation,
      });
    }
    this.listeners.forEach(listener => listener());
  }
  private recordKey(entry: AfterSaleEntry) {
    // 同一订单项改变数量或改选流程，也不能覆盖未确定的申请。
    return JSON.stringify([entry.orderId, entry.orderItemId]);
  }
  private current(generation: number) {
    return (
      generation === this.generation &&
      this.userId !== null &&
      this.userId === (this.session.getSnapshot()?.userId ?? null)
    );
  }

  open(entry: AfterSaleEntry | undefined): () => void {
    if (this.state.phase === 'submitting') {
      this.publish({ ...this.state, phase: 'unknown' });
    }
    const generation = ++this.generation;
    this.operation = undefined;
    if (!this.userId) {
      this.publish({ phase: 'signedOut' });
    } else if (
      !entry ||
      !Number.isSafeInteger(entry.quantity) ||
      entry.quantity < 1
    ) {
      this.publish({ phase: 'error', error: 'invalid' });
    } else {
      const previous = this.records.get(this.recordKey(entry));
      const retained =
        previous &&
        ['success', 'unknown', 'conflict', 'submitting'].includes(
          previous.state.phase,
        );
      if (retained) {
        this.operation = previous.operation;
        this.publish(previous.state);
      } else {
        this.publish({ phase: 'loading', entry: { ...entry } });
        this.load(generation, entry);
      }
    }
    return () => {
      if (generation !== this.generation) {
        return;
      }
      this.generation += 1;
      if (this.state.phase === 'submitting') {
        this.publish({ ...this.state, phase: 'unknown' });
      }
    };
  }

  async reload() {
    const entry = this.state.entry;
    if (!entry || !['error', 'ready'].includes(this.state.phase)) {
      return;
    }
    this.publish({ phase: 'loading', entry });
    await this.load(this.generation, entry);
  }

  private async readEntry(entry: AfterSaleEntry) {
    const order = await this.orders.getForAfterSale(entry.orderId);
    const matches = order.items.filter(
      item => item.orderItemId === entry.orderItemId,
    );
    const item = matches[0];
    if (
      order.orderId !== entry.orderId ||
      matches.length !== 1 ||
      !item ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < entry.quantity
    ) {
      throw new AfterSaleValidationError();
    }
    return { orderStatus: order.status, maxQuantity: item.quantity };
  }

  private async load(generation: number, entry: AfterSaleEntry) {
    try {
      const projection = await this.readEntry(entry);
      if (this.current(generation)) {
        this.publish({ phase: 'ready', entry, ...projection });
      }
    } catch (error) {
      if (this.current(generation)) {
        this.publish({
          phase: 'error',
          entry,
          error: error instanceof AfterSaleValidationError ? 'invalid' : 'load',
        });
      }
    }
  }

  async submit(intent: ApplicationIntent) {
    const { entry, phase } = this.state;
    if (!entry || phase !== 'ready' || !this.current(this.generation)) {
      return;
    }
    // 保存确认时的独立副本，调用方继续编辑不能改变重试 body。
    const saved: ApplicationIntent =
      intent.flow === 'refund'
        ? {
            flow: 'refund',
            input: {
              ...intent.input,
              items: intent.input.items.map(item => ({ ...item })),
            },
          }
        : {
            flow: 'afterSale',
            input: {
              ...intent.input,
              items: intent.input.items.map(item => ({ ...item })),
            },
          };
    try {
      validateInput(saved.input, saved.flow);
      const item = saved.input.items[0];
      if (
        saved.input.orderId !== entry.orderId ||
        saved.input.items.length !== 1 ||
        item.orderItemId !== entry.orderItemId ||
        item.quantity !== entry.quantity
      ) {
        throw new AfterSaleValidationError();
      }
    } catch {
      this.publish({ ...this.state, phase: 'error', error: 'invalid' });
      return;
    }
    const generation = this.generation;
    this.publish({
      ...this.state,
      phase: 'checking',
      intent: saved,
      error: undefined,
    });
    try {
      await this.readEntry(entry);
    } catch (error) {
      if (this.current(generation)) {
        this.publish({
          ...this.state,
          phase: 'error',
          error: error instanceof AfterSaleValidationError ? 'invalid' : 'load',
        });
      }
      return;
    }
    if (!this.current(generation)) {
      return;
    }
    this.operation = { intent: saved, key: this.newKey() };
    await this.send(generation, this.operation);
  }

  async retryRefund() {
    const operation = this.operation;
    if (
      this.state.phase !== 'unknown' ||
      operation?.intent.flow !== 'refund' ||
      !this.current(this.generation)
    ) {
      return;
    }
    // 仅显式重试原退款；不重读后重建意图，避免已受理退款改变资格后丢失查询机会。
    await this.send(this.generation, operation);
  }

  private async send(generation: number, operation: Operation) {
    const previouslyUncertain = this.state.phase === 'unknown';
    this.publish({
      ...this.state,
      phase: 'submitting',
      error: undefined,
      requestId: undefined,
    });
    try {
      const intent = operation.intent;
      let result: { id: string; status: string };
      if (intent.flow === 'refund') {
        const response = await this.port.requestRefund(intent.input, {
          idempotencyKey: operation.key,
        });
        result = { id: response.refundId, status: response.status };
      } else {
        const response = await this.port.requestAfterSale(intent.input);
        result = { id: response.afterSaleId, status: response.status };
      }
      if (this.current(generation)) {
        this.publish({ ...this.state, phase: 'success', result });
      }
    } catch (error) {
      if (!this.current(generation)) {
        return;
      }
      const conflict = error instanceof ApiError && error.status === 409;
      const rejected =
        error instanceof AuthenticationRequiredError ||
        error instanceof AfterSaleValidationError ||
        (error instanceof ApiError &&
          [400, 401, 403, 404, 422].includes(error.status));
      let next: Phase = 'unknown';
      if (conflict) {
        next = 'conflict';
      } else if (rejected && !previouslyUncertain) {
        next = 'error';
      }
      this.publish({
        ...this.state,
        phase: next,
        error: rejected ? 'rejected' : undefined,
        requestId: error instanceof ApiError ? error.requestId : undefined,
      });
    }
  }
}
