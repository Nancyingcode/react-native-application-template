import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { AccountStore } from '../src/modules/commerce/account/AccountStore';
import type {
  MemberProfile,
  PointsAccount,
} from '../src/modules/commerce/account/repository';

const member = { userId: 'a', growthValue: 10 } as MemberProfile;
const points = {
  userId: 'a',
  available: 10,
  frozen: 0,
  totalEarned: 10,
  totalSpent: 0,
} as PointsAccount;
const login = (session: SessionManager, userId: string) =>
  session.setSession({
    userId,
    permissions: [],
    accessToken: userId,
    expiresAt: Date.now() + 60000,
  });

it('loads account, prevents duplicate requests, and clears data on logout', async () => {
  const session = new SessionManager(new InMemorySessionStore());
  await login(session, 'a');
  const repository = {
    member: jest.fn().mockResolvedValue(member),
    points: jest.fn().mockResolvedValue(points),
  };
  const store = new AccountStore(repository, session);
  await Promise.all([store.refresh(), store.refresh()]);
  expect(repository.member).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().points?.available).toBe(10);
  await session.signOut();
  expect(store.getSnapshot()).toMatchObject({
    points: null,
    member: null,
    userId: null,
  });
  store.dispose();
});

it.each(['leave', 'switch', 'same-user-login', 'dispose'])(
  'ignores late responses after %s',
  async event => {
    const session = new SessionManager(new InMemorySessionStore());
    await login(session, 'a');
    let resolve!: (value: MemberProfile) => void;
    const repository = {
      member: jest.fn(
        () =>
          new Promise<MemberProfile>(done => {
            resolve = done;
          }),
      ),
      points: jest.fn().mockResolvedValue(points),
    };
    const store = new AccountStore(repository, session);
    const pending = store.refresh();
    if (event === 'leave') {
      store.cancelPending();
    }
    if (event === 'switch') {
      await login(session, 'b');
    }
    if (event === 'same-user-login') {
      await session.signOut();
      await login(session, 'a');
    }
    if (event === 'dispose') {
      store.dispose();
    }
    resolve(member);
    await pending;
    expect(store.getSnapshot().points).toBeNull();
    store.dispose();
  },
);

it('rejects another account payload and can recover by refresh', async () => {
  const session = new SessionManager(new InMemorySessionStore());
  await login(session, 'a');
  const repository = {
    member: jest.fn().mockResolvedValue(member),
    points: jest
      .fn()
      .mockResolvedValueOnce({ ...points, userId: 'b' })
      .mockResolvedValue(points),
  };
  const store = new AccountStore(repository, session);
  await store.refresh();
  expect(store.getSnapshot()).toMatchObject({ error: true, points: null });
  await store.refresh();
  expect(store.getSnapshot()).toMatchObject({ error: false, points });
  store.dispose();
});
