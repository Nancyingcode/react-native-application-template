import type { SessionManager } from '../../../core/auth';
import { OwnedStore, type OwnedState } from '../account/OwnedStore';
import type { Notification, NotificationsRepository } from './repository';

export interface NotificationsState extends OwnedState {
  items: readonly Notification[];
  nextCursor: string | null;
  loaded: boolean;
  unread: number | null;
}
export class NotificationsStore extends OwnedStore<NotificationsState> {
  constructor(
    private readonly repository: Pick<
      NotificationsRepository,
      'page' | 'unreadCount' | 'read' | 'readAll'
    >,
    session: SessionManager,
  ) {
    super(session, userId => ({
      userId,
      busy: false,
      error: false,
      items: [],
      nextCursor: null,
      loaded: false,
      unread: null,
    }));
  }

  refresh = (): Promise<void> =>
    this.run(async (isCurrent, userId) => {
      await this.loadFirst(isCurrent, userId);
    });

  private async loadFirst(
    isCurrent: () => boolean,
    userId: string,
  ): Promise<void> {
    const [page, unread] = await Promise.all([
      this.repository.page(),
      this.repository.unreadCount(),
    ]);
    if (!isCurrent()) {
      return;
    }
    this.checkItems(page.items, userId);
    this.publish({
      items: this.merge([], page.items),
      nextCursor: page.nextCursor,
      unread,
      loaded: true,
    });
  }

  refreshCount = (): Promise<void> =>
    this.run(async isCurrent => {
      const unread = await this.repository.unreadCount();
      if (isCurrent()) {
        this.publish({ unread });
      }
    });

  loadMore = (): Promise<void> =>
    this.run(async (isCurrent, userId) => {
      const after = this.state.nextCursor;
      if (!this.state.loaded || after === null) {
        return;
      }
      const page = await this.repository.page(after);
      if (!isCurrent()) {
        return;
      }
      this.checkItems(page.items, userId);
      if (page.nextCursor === after) {
        throw new Error('Non-advancing notification cursor');
      }
      this.publish({
        items: this.merge(this.state.items, page.items),
        nextCursor: page.nextCursor,
      });
    });

  markRead = (id: string): Promise<void> =>
    this.run(async (isCurrent, userId) => {
      const item = this.state.items.find(entry => entry.id === id);
      if (!item || item.status === 'READ' || item.readAt !== null) {
        return;
      }
      await this.repository.read(id);
      if (!isCurrent()) {
        return;
      }
      // 已确认的行可以更新，但未读总数必须重新查询，不能减去本页数量。
      this.publish({
        items: this.state.items.map(entry =>
          entry.id === id ? { ...entry, status: 'READ' } : entry,
        ),
        unread: null,
      });
      const unread = await this.repository.unreadCount();
      if (isCurrent() && this.state.userId === userId) {
        this.publish({ unread });
      }
    });

  markAllRead = (): Promise<void> =>
    this.run(async (isCurrent, userId) => {
      await this.repository.readAll();
      if (!isCurrent()) {
        return;
      }
      // 请求期间可能收到新消息，不能把本地计数直接置零或盲标所有行。
      this.publish({ unread: null });
      await this.loadFirst(isCurrent, userId);
    });

  private checkItems(items: Notification[], userId: string): void {
    if (
      items.some(item => item.userId !== userId || item.channel !== 'IN_APP')
    ) {
      throw new Error('Notification ownership mismatch');
    }
  }
  private merge(
    previous: readonly Notification[],
    next: Notification[],
  ): Notification[] {
    return Array.from(
      new Map([...previous, ...next].map(item => [item.id, item])).values(),
    );
  }
}
