import type { SessionManager } from '../../../core/auth';
import { ApiError, AuthenticationRequiredError } from '../../../core/http';
import { createIdempotencyKey } from '../shared/idempotency';
import type { CouponsRepository, CouponStatus, UserCoupon } from './repository';

export type ClaimOperation = Readonly<{
  couponTemplateId: string;
  idempotencyKey: string;
  status: 'sending' | 'unknown' | 'failed' | 'success';
  coupon?: UserCoupon;
  error?: ApiError;
}>;

export class CouponsClient {
  private generation = 0;
  private userId: string | null;
  private operations = new Map<string, ClaimOperation>();
  private flights = new Map<string, Promise<UserCoupon>>();
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;
  private disposed = false;

  constructor(
    private readonly repository: Pick<
      CouponsRepository,
      'my' | 'available' | 'claim'
    >,
    session: SessionManager,
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
      this.operations.clear();
      this.flights.clear();
      this.emit();
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getGeneration = () => this.generation;
  isAuthenticated = () => !this.disposed && this.userId !== null;
  private emit() {
    this.listeners.forEach(listener => listener());
  }
  private assertOwner(generation: number) {
    if (!this.isAuthenticated() || generation !== this.generation) {
      throw new AuthenticationRequiredError();
    }
  }
  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.unsubscribe();
    this.operations.clear();
    this.flights.clear();
    this.emit();
    this.listeners.clear();
  }
  async query(mode: 'my' | 'available', status?: CouponStatus) {
    const owner = this.generation;
    this.assertOwner(owner);
    const coupons = await (mode === 'my'
      ? this.repository.my(status)
      : this.repository.available());
    this.assertOwner(owner);
    return coupons;
  }
  getClaim = (templateId: string) => this.operations.get(templateId);

  claim(templateId: string): Promise<UserCoupon> {
    const owner = this.generation;
    if (!this.isAuthenticated()) {
      return Promise.reject(new AuthenticationRequiredError());
    }
    if (!templateId.trim()) {
      return Promise.reject(new Error('Coupon template is required'));
    }
    const flight = this.flights.get(templateId);
    if (flight) {
      return flight;
    }
    const previous = this.operations.get(templateId);
    if (previous?.coupon) {
      return Promise.resolve(previous.coupon);
    }
    // A timeout or conflict may have consumed the claim. Never replace its key on retry/remount.
    const operation: ClaimOperation = {
      couponTemplateId: templateId,
      idempotencyKey: previous?.idempotencyKey ?? this.newKey(),
      status: 'sending',
    };
    this.operations.set(templateId, operation);
    const result = Promise.resolve().then(async () => {
      this.assertOwner(owner);
      try {
        const coupon = await this.repository.claim(
          templateId,
          operation.idempotencyKey,
        );
        this.assertOwner(owner);
        if (coupon.couponTemplateId !== templateId) {
          throw new Error('Claim template mismatch');
        }
        this.operations.set(templateId, {
          ...operation,
          status: 'success',
          coupon,
        });
        return coupon;
      } catch (error) {
        if (owner === this.generation && !this.disposed) {
          const rejected =
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 408 &&
            error.status !== 409;
          this.operations.set(templateId, {
            ...operation,
            status: rejected ? 'failed' : 'unknown',
            error: error instanceof ApiError ? error : undefined,
          });
        }
        throw error;
      } finally {
        if (owner === this.generation) {
          this.flights.delete(templateId);
          this.emit();
        }
      }
    });
    this.flights.set(templateId, result);
    this.emit();
    return result;
  }
}
