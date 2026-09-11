import type { HttpClient } from '../../../core/http';

export interface MemberLevel {
  id: string;
  code: string;
  name: string;
  growthThreshold: number;
  discountRate: number;
  freeShipping: boolean;
  pointsMultiplier: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface MemberProfile {
  userId: string;
  levelConfigId: string;
  growthValue: number;
  createdAt: string;
  updatedAt: string;
  levelConfig: MemberLevel;
}
export interface PointsAccount {
  userId: string;
  available: number;
  frozen: number;
  totalEarned: number;
  totalSpent: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface SpendPointsInput {
  amount: number;
  sourceId: string;
}
export interface PointsLedger {
  id: string;
  userId: string;
  type: 'EARN' | 'SPEND' | 'REFUND_DEDUCT' | 'EXPIRE' | 'ADJUST';
  amount: number;
  balanceAfter: number;
  sourceType: string;
  sourceId: string;
  expiresAt: string | null;
  createdAt: string;
}

export class AccountRepository {
  constructor(private readonly http: Pick<HttpClient, 'request'>) {}

  async member(): Promise<MemberProfile> {
    const { data } = await this.http.request<{ data: MemberProfile }>(
      '/api/v1/members/me',
      { authenticated: true },
    );
    return data;
  }

  async points(): Promise<PointsAccount> {
    const { data } = await this.http.request<{ data: PointsAccount }>(
      '/api/v1/points/account',
      { authenticated: true },
    );
    return data;
  }

  /** sourceId 必须来自真实兑换业务；同一意图重试保留原值，不自动重放。 */
  async spend(input: SpendPointsInput): Promise<PointsLedger> {
    if (
      !Number.isSafeInteger(input.amount) ||
      input.amount < 1 ||
      !input.sourceId.trim()
    ) {
      throw new Error('Invalid points redemption');
    }
    const { data } = await this.http.request<{ data: PointsLedger }>(
      '/api/v1/points/spend',
      { method: 'POST', authenticated: true, retry: 0, body: { ...input } },
    );
    return data;
  }
}
