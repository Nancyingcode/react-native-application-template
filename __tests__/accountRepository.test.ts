import { AccountRepository } from '../src/modules/commerce/account/repository';

describe('account API', () => {
  it('unwraps authenticated member and points responses without a shared cache', async () => {
    const request = jest.fn().mockResolvedValue({ data: { userId: 'a' } });
    const repository = new AccountRepository({ request });
    await expect(repository.member()).resolves.toEqual({ userId: 'a' });
    await repository.points();
    expect(request.mock.calls).toEqual([
      ['/api/v1/members/me', { authenticated: true }],
      ['/api/v1/points/account', { authenticated: true }],
    ]);
  });

  it('preserves the business source on an explicit retry and never adds a fabricated key', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue({ data: { id: 'ledger' } });
    const repository = new AccountRepository({ request });
    const input = { amount: 100, sourceId: 'redemption-20260908-001' };
    await expect(repository.spend(input)).rejects.toThrow('timeout');
    expect(request).toHaveBeenCalledTimes(1);
    await expect(repository.spend(input)).resolves.toEqual({ id: 'ledger' });
    expect(request.mock.calls[0]).toEqual(request.mock.calls[1]);
    expect(request).toHaveBeenLastCalledWith('/api/v1/points/spend', {
      method: 'POST',
      authenticated: true,
      retry: 0,
      body: input,
    });
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid amount %s before HTTP',
    async amount => {
      const request = jest.fn();
      await expect(
        new AccountRepository({ request }).spend({
          amount,
          sourceId: 'business',
        }),
      ).rejects.toThrow();
      expect(request).not.toHaveBeenCalled();
    },
  );
  it('rejects missing business source', async () => {
    const request = jest.fn();
    await expect(
      new AccountRepository({ request }).spend({ amount: 1, sourceId: ' ' }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
