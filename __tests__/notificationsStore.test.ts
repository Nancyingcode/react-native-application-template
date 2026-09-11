import { InMemorySessionStore, SessionManager } from '../src/core/auth';
import { NotificationsStore } from '../src/modules/commerce/notifications/NotificationsStore';
import type { Notification } from '../src/modules/commerce/notifications/repository';

function notification(id: string): Notification {
  return {
    id,
    userId: 'a',
    eventId: 'event',
    channel: 'IN_APP',
    type: 'ORDER',
    title: id,
    content: 'message',
    status: 'SENT',
    readAt: null,
    sentAt: null,
    error: null,
    createdAt: '',
    updatedAt: '',
  };
}
async function setup() {
  const session = new SessionManager(new InMemorySessionStore());
  await session.setSession({
    userId: 'a',
    permissions: [],
    accessToken: 'a',
    expiresAt: Date.now() + 60000,
  });
  const repository = {
    page: jest
      .fn()
      .mockResolvedValue({ items: [notification('1')], nextCursor: 'cursor' }),
    unreadCount: jest.fn().mockResolvedValue(5),
    read: jest.fn().mockResolvedValue(undefined),
    readAll: jest.fn().mockResolvedValue(5),
  };
  const store = new NotificationsStore(repository, session);
  await store.refresh();
  return { session, repository, store };
}

it('paginates by cursor, deduplicates rows and stops at null', async () => {
  const { repository, store } = await setup();
  repository.page.mockResolvedValue({
    items: [notification('1'), notification('2')],
    nextCursor: null,
  });
  await Promise.all([store.loadMore(), store.loadMore()]);
  expect(repository.page).toHaveBeenLastCalledWith('cursor');
  expect(repository.page).toHaveBeenCalledTimes(2);
  expect(store.getSnapshot().items.map(item => item.id)).toEqual(['1', '2']);
  await store.loadMore();
  expect(repository.page).toHaveBeenCalledTimes(2);
  store.dispose();
});

it('keeps loaded rows and cursor after a page failure, allowing explicit retry', async () => {
  const { repository, store } = await setup();
  repository.page.mockRejectedValueOnce(new Error('offline'));
  await store.loadMore();
  expect(store.getSnapshot()).toMatchObject({
    error: true,
    nextCursor: 'cursor',
  });
  expect(store.getSnapshot().items).toHaveLength(1);
  repository.page.mockResolvedValue({
    items: [notification('2')],
    nextCursor: null,
  });
  await store.loadMore();
  expect(store.getSnapshot()).toMatchObject({ error: false, nextCursor: null });
  store.dispose();
});

it('does not permanently decrement on failed read or automatically replay', async () => {
  const { repository, store } = await setup();
  repository.read.mockRejectedValue(new Error('timeout'));
  await Promise.all([store.markRead('1'), store.markRead('1')]);
  expect(repository.read).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot()).toMatchObject({ unread: 5, error: true });
  expect(store.getSnapshot().items[0].status).toBe('SENT');
  store.dispose();
});

it('uses authoritative count after single read and ignores repeat read of the same row', async () => {
  const { repository, store } = await setup();
  repository.unreadCount.mockResolvedValue(8);
  await store.markRead('1');
  expect(store.getSnapshot().unread).toBe(8);
  expect(store.getSnapshot().items[0].status).toBe('READ');
  await store.markRead('1');
  expect(repository.read).toHaveBeenCalledTimes(1);
  store.dispose();
});

it('shows unknown count after confirmed read when reconciliation fails, then recovers', async () => {
  const { repository, store } = await setup();
  repository.unreadCount.mockRejectedValueOnce(new Error('offline'));
  await store.markRead('1');
  expect(store.getSnapshot()).toMatchObject({ error: true, unread: null });
  repository.unreadCount.mockResolvedValue(4);
  await store.refreshCount();
  expect(store.getSnapshot()).toMatchObject({ error: false, unread: 4 });
  store.dispose();
});

it('reconciles read-all with newly arrived messages instead of forcing zero', async () => {
  const { repository, store } = await setup();
  repository.page.mockResolvedValue({
    items: [notification('new')],
    nextCursor: null,
  });
  repository.unreadCount.mockResolvedValue(1);
  await store.markAllRead();
  expect(store.getSnapshot().unread).toBe(1);
  expect(store.getSnapshot().items[0].status).toBe('SENT');
  store.dispose();
});

it('preserves unread count after read-all failure', async () => {
  const { repository, store } = await setup();
  repository.readAll.mockRejectedValue(new Error('503'));
  await store.markAllRead();
  expect(repository.readAll).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot()).toMatchObject({ unread: 5, error: true });
  store.dispose();
});

it.each(['logout', 'leave', 'dispose'])(
  'late read confirmation after %s cannot update count or launch follow-up',
  async event => {
    const { repository, store, session } = await setup();
    let resolve!: () => void;
    repository.read.mockImplementation(
      () =>
        new Promise<void>(done => {
          resolve = done;
        }),
    );
    const pending = store.markRead('1');
    if (event === 'logout') {
      await session.signOut();
    }
    if (event === 'leave') {
      store.cancelPending();
    }
    if (event === 'dispose') {
      store.dispose();
    }
    resolve();
    await pending;
    expect(repository.unreadCount).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().items.some(item => item.status === 'READ')).toBe(
      false,
    );
    store.dispose();
  },
);

it('rejects stale account page and repeated cursors', async () => {
  const { repository, store } = await setup();
  repository.page.mockResolvedValue({
    items: [{ ...notification('2'), userId: 'b' }],
    nextCursor: null,
  });
  await store.loadMore();
  expect(store.getSnapshot().items).toHaveLength(1);
  expect(store.getSnapshot().error).toBe(true);
  repository.page.mockResolvedValue({ items: [], nextCursor: 'cursor' });
  await store.loadMore();
  expect(store.getSnapshot().error).toBe(true);
  store.dispose();
});
