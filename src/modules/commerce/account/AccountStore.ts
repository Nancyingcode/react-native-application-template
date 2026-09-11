import type { SessionManager } from '../../../core/auth';
import { OwnedStore, type OwnedState } from './OwnedStore';
import type {
  AccountRepository,
  MemberProfile,
  PointsAccount,
} from './repository';

export interface AccountState extends OwnedState {
  member: MemberProfile | null;
  points: PointsAccount | null;
}
export class AccountStore extends OwnedStore<AccountState> {
  constructor(
    private readonly repository: Pick<AccountRepository, 'member' | 'points'>,
    session: SessionManager,
  ) {
    super(session, userId => ({
      userId,
      busy: false,
      error: false,
      member: null,
      points: null,
    }));
  }

  refresh = (): Promise<void> =>
    this.run(async (isCurrent, userId) => {
      const [member, points] = await Promise.all([
        this.repository.member(),
        this.repository.points(),
      ]);
      if (!isCurrent()) {
        return;
      }
      if (member.userId !== userId || points.userId !== userId) {
        throw new Error('Account mismatch');
      }
      if (
        ![
          points.available,
          points.frozen,
          points.totalEarned,
          points.totalSpent,
          member.growthValue,
        ].every(value => Number.isSafeInteger(value) && value >= 0)
      ) {
        throw new Error('Invalid account balance');
      }
      this.publish({ member, points });
    });
}
