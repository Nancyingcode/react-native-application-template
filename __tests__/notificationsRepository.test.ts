import { NotificationsRepository } from '../src/modules/commerce/notifications/repository';

describe('notifications API', () => {
  it('uses the opaque cursor, and keeps the recent endpoint separate', async () => {
    const request = jest
      .fn()
      .mockResolvedValue({ data: { items: [], nextCursor: null } });
    const repository = new NotificationsRepository({ request });
    await repository.page();
    await repository.page('a/+?=', 50);
    await repository.recent();
    expect(request.mock.calls).toEqual([
      ['/api/v1/notifications/cursor?limit=20', { authenticated: true }],
      [
        '/api/v1/notifications/cursor?limit=50&after=a%2F%2B%3F%3D',
        { authenticated: true },
      ],
      ['/api/v1/notifications', { authenticated: true }],
    ]);
  });
  it.each([0, 101, 1.5, NaN])('rejects invalid limit %s', async limit => {
    const request = jest.fn();
    await expect(
      new NotificationsRepository({ request }).page(undefined, limit),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it('posts encoded IDs and read-all without retries or invented bodies', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({ data: { id: 'a/b', read: true } })
      .mockResolvedValueOnce({ data: { updated: 3 } });
    const repository = new NotificationsRepository({ request });
    await repository.read('a/b');
    await expect(repository.readAll()).resolves.toBe(3);
    expect(request.mock.calls).toEqual([
      [
        '/api/v1/notifications/a%2Fb/read',
        { method: 'POST', authenticated: true, retry: 0 },
      ],
      [
        '/api/v1/notifications/read-all',
        { method: 'POST', authenticated: true, retry: 0 },
      ],
    ]);
  });
  it('rejects mismatched confirmations and invalid unread counts', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({ data: { id: 'wrong', read: true } })
      .mockResolvedValueOnce({ data: { count: -1 } });
    const repository = new NotificationsRepository({ request });
    await expect(repository.read('id')).rejects.toThrow();
    await expect(repository.unreadCount()).rejects.toThrow();
  });
});
