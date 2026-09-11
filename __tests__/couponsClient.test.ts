import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { ApiError } from '../src/core/http';
import { CouponsClient } from '../src/modules/commerce/coupons/client';
import type { UserCoupon } from '../src/modules/commerce/coupons/repository';

const coupon: UserCoupon = {
  id: 'instance',
  couponTemplateId: 'template',
  name: 'Coupon',
  type: 'CASH',
  status: 'AVAILABLE',
  validFrom: '',
  validUntil: '',
  orderId: null,
  unavailableReason: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup() {
  const session = new SessionManager(new InMemorySessionStore());
  const login = (userId: string) =>
    session.setSession({
      userId,
      accessToken: userId,
      expiresAt: Date.now() + 60000,
      permissions: [],
    });
  await login('A');
  const repository = {
    my: jest.fn().mockResolvedValue([coupon]),
    available: jest.fn().mockResolvedValue([coupon]),
    claim: jest.fn().mockResolvedValue(coupon),
  };
  const newKey = jest
    .fn()
    .mockReturnValueOnce('operation-1')
    .mockReturnValue('operation-2');
  const client = new CouponsClient(repository, session, newKey);
  return { client, repository, login, session, newKey };
}

it('shares duplicate in-flight claims and retains the key after an uncertain result', async () => {
  const { client, repository, newKey } = await setup();
  repository.claim.mockRejectedValueOnce(new Error('timeout'));
  const first = client.claim('template');
  expect(client.claim('template')).toBe(first);
  await expect(first).rejects.toThrow('timeout');
  expect(client.getClaim('template')?.status).toBe('unknown');
  expect(await client.claim('template')).toEqual(coupon);
  expect(repository.claim.mock.calls).toEqual([
    ['template', 'operation-1'],
    ['template', 'operation-1'],
  ]);
  expect(await client.claim('template')).toEqual(coupon);
  expect(repository.claim).toHaveBeenCalledTimes(2);
  expect(newKey).toHaveBeenCalledTimes(1);
  client.dispose();
});

it('discards A responses after A signs out and signs back in', async () => {
  const { client, repository, session, login } = await setup();
  const list = deferred<readonly UserCoupon[]>();
  const claim = deferred<UserCoupon>();
  repository.my.mockReturnValueOnce(list.promise);
  repository.claim.mockReturnValueOnce(claim.promise);
  const loading = client.query('my');
  const claiming = client.claim('template');
  await Promise.resolve();
  await session.signOut();
  await login('A');
  list.resolve([coupon]);
  claim.resolve(coupon);
  await expect(loading).rejects.toThrow('valid session');
  await expect(claiming).rejects.toThrow('valid session');
  expect(client.getClaim('template')).toBeUndefined();
  await client.claim('template');
  expect(repository.claim).toHaveBeenLastCalledWith('template', 'operation-2');
  client.dispose();
});

it('blocks queued claims on account change and rejects queries after disposal', async () => {
  const { client, repository, session } = await setup();
  const signOut = session.signOut();
  await signOut;
  await expect(client.claim('template')).rejects.toThrow('valid session');
  expect(repository.claim).not.toHaveBeenCalled();
  client.dispose();
  await expect(client.query('available')).rejects.toThrow('valid session');
});

it('does not accept a claim for a different template', async () => {
  const { client } = await setup();
  await expect(client.claim('another-template')).rejects.toThrow('mismatch');
  expect(client.getClaim('another-template')?.status).toBe('unknown');
  client.dispose();
});

it.each([400, 409, 503])(
  'retains failure details and the same operation after %s',
  async status => {
    const { client, repository } = await setup();
    const error = new ApiError(
      'Not eligible',
      status,
      'CLAIM_ERROR',
      'request-id',
    );
    repository.claim.mockRejectedValueOnce(error);
    await expect(client.claim('template')).rejects.toBe(error);
    expect(client.getClaim('template')).toMatchObject({
      status: status === 400 ? 'failed' : 'unknown',
      error,
    });
    await client.claim('template');
    expect(repository.claim.mock.calls[1]).toEqual(
      repository.claim.mock.calls[0],
    );
    client.dispose();
  },
);
