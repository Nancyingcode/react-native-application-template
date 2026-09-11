import type { SessionManager } from '../../../core/auth';

export interface OwnedState {
  userId: string | null;
  busy: boolean;
  error: boolean;
}

/** 账号生命周期与页面请求代次独立于 Token 续期；认证数据仅存于此实例内存。 */
export class OwnedStore<S extends OwnedState> {
  protected state: S;
  private generation = 0;
  private disposed = false;
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;

  constructor(
    session: SessionManager,
    private readonly empty: (userId: string | null) => S,
  ) {
    this.state = empty(session.getSnapshot()?.userId ?? null);
    this.unsubscribe = session.subscribe(() => {
      const userId = session.getSnapshot()?.userId ?? null;
      if (userId !== this.state.userId) {
        this.generation++;
        this.state = empty(userId);
        this.emit();
      }
    });
  }

  getSnapshot = (): S => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(): void {
    this.listeners.forEach(listener => listener());
  }
  protected publish(patch: Partial<S>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  cancelPending = (): void => {
    this.generation++;
    this.publish({ busy: false } as Partial<S>);
  };

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.unsubscribe();
    this.state = this.empty(null);
    this.emit();
    this.listeners.clear();
  }

  protected async run(
    action: (isCurrent: () => boolean, userId: string) => Promise<void>,
  ): Promise<void> {
    if (this.disposed || this.state.busy || !this.state.userId) {
      return;
    }
    const generation = this.generation;
    const userId = this.state.userId;
    const isCurrent = () => !this.disposed && generation === this.generation;
    this.publish({ busy: true, error: false } as Partial<S>);
    try {
      await action(isCurrent, userId);
    } catch {
      if (isCurrent()) {
        this.publish({ error: true } as Partial<S>);
      }
    } finally {
      if (isCurrent()) {
        this.publish({ busy: false } as Partial<S>);
      }
    }
  }
}
