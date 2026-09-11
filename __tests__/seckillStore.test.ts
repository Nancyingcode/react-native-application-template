import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { SeckillStore } from '../src/modules/commerce/seckill/SeckillStore';
import {
  getActivityPhase,
  getQuantityLimit,
} from '../src/modules/commerce/seckill/state';
import type {
  SeckillPort,
  SeckillReceipt,
  SeckillToken,
} from '../src/modules/commerce/seckill/types';
import {
  activity,
  address,
  deferred,
  now,
} from '../src/modules/commerce/seckill/testing/fixtures';

describe('seckill state and side effects', () => {
  let store: SeckillStore;
  let session: SessionManager;
  let repository: jest.Mocked<SeckillPort>;
  let time: number;
  async function login(userId = 'a') {
    await session.setSession({
      userId,
      accessToken: userId,
      permissions: [],
      expiresAt: Date.now() + 60000,
    });
  }
  beforeEach(async () => {
    time = now;
    session = new SessionManager(new InMemorySessionStore());
    await login();
    repository = {
      list: jest.fn().mockResolvedValue([activity]),
      get: jest.fn().mockResolvedValue(activity),
      token: jest.fn().mockResolvedValue({
        token: 'secret',
        expiresAt: new Date(now + 10000).toISOString(),
      }),
      request: jest
        .fn()
        .mockResolvedValue({ status: 'QUEUED', requestId: 'receipt' }),
    };
    store = new SeckillStore(
      repository,
      session,
      () => 'verified test price',
      () => time,
    );
    await store.open(activity.id);
  });
  afterEach(() => store.dispose());
  it.each([
    ['DRAFT', 'unavailable'],
    ['CANCELLED', 'cancelled'],
    ['ENDED', 'ended'],
    ['SCHEDULED', 'scheduled'],
    ['ACTIVE', 'active'],
    ['FUTURE', 'unavailable'],
  ])('preserves server status %s as %s', (status, phase) => {
    expect(getActivityPhase({ ...activity, status }, now)).toBe(phase);
  });
  it('checks temporal boundaries and all quantity limits', () => {
    expect(getActivityPhase(activity, Date.parse(activity.startAt) - 1)).toBe(
      'scheduled',
    );
    expect(getActivityPhase(activity, Date.parse(activity.endAt))).toBe(
      'ended',
    );
    expect(getQuantityLimit(activity.skus[0])).toBe(3);
    expect(getQuantityLimit({ ...activity.skus[0], availableStock: 0 })).toBe(
      0,
    );
    expect(getQuantityLimit({ ...activity.skus[0], perUserLimit: 99 })).toBe(
      10,
    );
  });
  it('blocks unknown amount without inventing units', async () => {
    store.dispose();
    store = new SeckillStore(repository, session, undefined, () => time);
    await store.open(activity.id);
    await store.acquireToken();
    await store.submit('sku/a', 1, address);
    expect(store.getSnapshot().error).toBe('priceUnknown');
    expect(repository.request).not.toHaveBeenCalled();
  });
  it('rejects limit overflow, missing address, wrong SKU and activity expiry', async () => {
    await store.acquireToken();
    await store.submit('sku/a', 4, address);
    await store.submit('wrong', 1, address);
    await store.submit('sku/a', 1, {});
    time = Date.parse(activity.endAt);
    await store.submit('sku/a', 1, address);
    expect(repository.request).not.toHaveBeenCalled();
  });
  it('expires tokens exactly and never extends expiry', async () => {
    await store.acquireToken();
    time += 10000;
    store.tick();
    expect(store.getSnapshot().tokenReady).toBe(false);
    await store.submit('sku/a', 1, address);
    expect(repository.request).not.toHaveBeenCalled();
  });
  it('serializes token clicks and discards late tokens after leaving', async () => {
    const pending = deferred<SeckillToken>();
    repository.token.mockReturnValue(pending.promise);
    const first = store.acquireToken();
    await store.acquireToken();
    expect(repository.token).toHaveBeenCalledTimes(1);
    store.leave();
    pending.resolve({
      token: 'late',
      expiresAt: new Date(now + 10000).toISOString(),
    });
    await first;
    expect(store.getSnapshot().tokenReady).toBe(false);
  });
  it('submits once, shows only queued, and remembers the request after re-entry', async () => {
    const pending = deferred<SeckillReceipt>();
    repository.request.mockReturnValue(pending.promise);
    await store.acquireToken();
    const first = store.submit('sku/a', 1, address);
    await store.submit('sku/a', 1, address);
    expect(repository.request).toHaveBeenCalledTimes(1);
    pending.resolve({ status: 'QUEUED', requestId: 'receipt' });
    await first;
    expect(store.getSnapshot().submissions['sku/a']).toEqual({
      status: 'queued',
      requestId: 'receipt',
    });
    store.leave();
    await store.open(activity.id);
    await store.acquireToken();
    await store.submit('sku/a', 1, address);
    expect(repository.request).toHaveBeenCalledTimes(1);
  });
  it('locks uncertain submissions instead of replaying even after remount', async () => {
    repository.request.mockRejectedValue(new Error('timeout'));
    await store.acquireToken();
    await store.submit('sku/a', 1, address);
    expect(store.getSnapshot().submissions['sku/a']).toEqual({
      status: 'unknown',
    });
    await store.open(activity.id);
    await store.acquireToken();
    await store.submit('sku/a', 1, address);
    expect(repository.request).toHaveBeenCalledTimes(1);
  });
  it('does not publish late submission to another account or after logout/login', async () => {
    const pending = deferred<SeckillReceipt>();
    repository.request.mockReturnValue(pending.promise);
    await store.acquireToken();
    const first = store.submit('sku/a', 1, address);
    await session.signOut();
    await login('b');
    await store.open(activity.id);
    pending.resolve({ status: 'QUEUED', requestId: 'old-account' });
    await first;
    expect(store.getSnapshot().submissions).toEqual({});
    expect(store.getSnapshot().tokenReady).toBe(false);
    await login('a');
    await store.open(activity.id);
    expect(store.getSnapshot().submissions['sku/a']).toEqual({
      status: 'unknown',
    });
  });
  it('discards stale activity responses on route switch', async () => {
    const pending = deferred<typeof activity>();
    repository.get
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ ...activity, id: 'second' });
    const first = store.open('first');
    await store.open('second');
    pending.resolve(activity);
    await first;
    expect(store.getSnapshot().activity?.id).toBe('second');
  });
  it('does not fetch as a guest or after disposal', async () => {
    await session.signOut();
    repository.get.mockClear();
    await store.open(activity.id);
    store.dispose();
    await store.open(activity.id);
    expect(repository.get).not.toHaveBeenCalled();
  });
  it('rejects a missing route identifier without leaving a permanent spinner', async () => {
    repository.get.mockClear();
    await store.open('');
    expect(store.getSnapshot()).toMatchObject({
      busy: false,
      error: 'loadFailed',
    });
    expect(repository.get).not.toHaveBeenCalled();
  });
});
