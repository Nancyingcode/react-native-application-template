import type { SessionManager } from '../../../core/auth';
import { ApiError, AuthenticationRequiredError } from '../../../core/http';
import { createIdempotencyKey } from '../shared/idempotency';
import type {
  NewPaymentProvider,
  PaymentResult,
  PaymentsPort,
} from './contracts';

export interface PaymentState {
  orderId: string;
  payment?: PaymentResult;
  provider?: NewPaymentProvider;
  phase: 'idle' | 'creating' | 'checking' | 'ready' | 'unknown' | 'blocked';
  message: string;
  hasOperation: boolean;
}
interface Operation {
  input: { orderId: string; provider: NewPaymentProvider };
  idempotencyKey: string;
  payment?: PaymentResult;
  blocked?: string;
}

/** 在模块装配时创建一次；操作键仅在本次账号生命周期内保留。 */
export class PaymentController {
  private operations = new Map<string, Operation>();
  private listeners = new Set<() => void>();
  private state: PaymentState = {
    orderId: '',
    phase: 'idle',
    message: '',
    hasOperation: false,
  };
  private userId: string | null;
  private generation = 0;
  private active = false;
  private unsubscribe: () => void;

  constructor(
    private readonly port: PaymentsPort,
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
      this.generation++;
      this.operations.clear();
      // 切账号后路由仍可能带旧 orderId，必须重新从订单入口进入。
      this.active = false;
      this.publish({
        orderId: '',
        phase: 'blocked',
        message: 'session',
        hasOperation: false,
      });
    });
  }

  getSnapshot = (): PaymentState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: PaymentState): void {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }

  enter(orderId: string): () => void {
    const generation = ++this.generation;
    this.active = true;
    const operation = this.operations.get(orderId);
    let phase: PaymentState['phase'] = 'idle';
    let message = '';
    if (operation) {
      phase = operation.payment ? 'ready' : 'unknown';
      message = operation.payment ? '' : 'unknown';
    }
    if (operation?.blocked) {
      phase = 'blocked';
      message = operation.blocked;
    }
    if (!orderId.trim() || !this.userId) {
      phase = 'blocked';
      message = !this.userId ? 'session' : 'invalidOrder';
    }
    this.publish({
      orderId,
      phase,
      message,
      payment: operation?.payment,
      provider: operation?.input.provider,
      hasOperation: !!operation,
    });
    if (operation?.payment && phase === 'ready') {
      this.check();
    }
    return () => {
      if (this.generation !== generation) {
        return;
      }
      this.active = false;
      this.generation++;
    };
  }

  private isCurrent(generation: number): boolean {
    return (
      this.active &&
      generation === this.generation &&
      !!this.userId &&
      this.session.getSnapshot()?.userId === this.userId
    );
  }

  async create(provider: NewPaymentProvider): Promise<void> {
    const { phase, orderId } = this.state;
    const canCreate =
      this.active &&
      this.userId &&
      orderId &&
      (phase === 'idle' || phase === 'unknown') &&
      !this.state.payment;
    if (!canCreate) {
      return;
    }
    let operation = this.operations.get(orderId);
    if (!operation) {
      operation = {
        input: { orderId, provider },
        idempotencyKey: this.newKey(),
      };
      this.operations.set(orderId, operation);
    }
    // 结果未知时仅重放同一意图，不能通过切渠道/换键绕过幂等冲突。
    const generation = this.generation;
    this.publish({
      ...this.state,
      phase: 'creating',
      message: '',
      hasOperation: true,
      provider: operation.input.provider,
    });
    try {
      const payment = await this.port.create(operation.input, {
        idempotencyKey: operation.idempotencyKey,
      });
      if (!this.isCurrent(generation)) {
        return;
      }
      this.validate(payment, orderId);
      operation.payment = payment;
      this.publish({ ...this.state, payment, phase: 'ready', message: '' });
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return;
      }
      const blocked =
        error instanceof AuthenticationRequiredError ||
        (error instanceof ApiError &&
          [400, 401, 403, 404, 409].includes(error.status));
      const message = paymentError(error, 'unknown');
      if (blocked) {
        operation.blocked = message;
      }
      this.publish({
        ...this.state,
        phase: blocked ? 'blocked' : 'unknown',
        message,
      });
    }
  }

  async check(): Promise<void> {
    const payment = this.state.payment;
    const canCheck =
      this.active &&
      payment &&
      (this.state.phase === 'ready' || this.state.phase === 'unknown');
    if (!canCheck) {
      return;
    }
    const generation = this.generation;
    this.publish({ ...this.state, phase: 'checking', message: '' });
    try {
      const result = await this.port.get(payment.paymentId);
      if (!this.isCurrent(generation)) {
        return;
      }
      this.validate(result, payment.orderId, payment.paymentId);
      const operation = this.operations.get(payment.orderId);
      if (operation) {
        operation.payment = result;
      }
      this.publish({
        ...this.state,
        payment: result,
        phase: 'ready',
        message: '',
      });
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return;
      }
      const forbidden =
        error instanceof AuthenticationRequiredError ||
        (error instanceof ApiError && [401, 403, 404].includes(error.status));
      const message = paymentError(error, 'queryFailed');
      if (forbidden) {
        const operation = this.operations.get(payment.orderId);
        if (operation) {
          operation.payment = undefined;
          operation.blocked = message;
        }
      }
      this.publish({
        ...this.state,
        payment: forbidden ? undefined : payment,
        phase: forbidden ? 'blocked' : 'unknown',
        message,
      });
    }
  }

  private validate(
    payment: PaymentResult,
    orderId: string,
    paymentId?: string,
  ): void {
    const wrongIdentity =
      payment.orderId !== orderId ||
      (paymentId !== undefined && payment.paymentId !== paymentId) ||
      ('userId' in payment && payment.userId !== this.userId);
    if (wrongIdentity) {
      throw new Error('Payment ownership mismatch');
    }
  }

  dispose(): void {
    this.active = false;
    this.generation++;
    this.operations.clear();
    this.unsubscribe();
    this.listeners.clear();
  }
}

function paymentError(error: unknown, fallback: string): string {
  if (error instanceof AuthenticationRequiredError) {
    return 'session';
  }
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'session';
    }
    if (error.status === 403 || error.status === 404) {
      return 'unavailable';
    }
    if (error.code === 'ORDER_EXPIRED') {
      return 'expiredOrder';
    }
    if (error.code === 'ORDER_ALREADY_PAID') {
      return 'paidOrder';
    }
    if (error.code === 'ORDER_ALREADY_CANCELLED') {
      return 'cancelledOrder';
    }
    if (error.status === 409) {
      return 'conflict';
    }
    if (error.status === 400) {
      return 'invalidRequest';
    }
  }
  return fallback;
}
