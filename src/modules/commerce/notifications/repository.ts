import type { HttpClient } from '../../../core/http';

export interface Notification {
  id: string;
  userId: string;
  eventId: string;
  channel: 'IN_APP' | 'SMS' | 'EMAIL' | 'PUSH';
  type: string;
  title: string;
  content: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'READ';
  readAt: string | null;
  sentAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface NotificationPage {
  items: Notification[];
  nextCursor: string | null;
}

export class NotificationsRepository {
  constructor(private readonly http: Pick<HttpClient, 'request'>) {}

  async page(after?: string, limit = 20): Promise<NotificationPage> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Invalid notification page size');
    }
    const cursor =
      after === undefined ? '' : `&after=${encodeURIComponent(after)}`;
    const { data } = await this.http.request<{ data: NotificationPage }>(
      `/api/v1/notifications/cursor?limit=${limit}${cursor}`,
      { authenticated: true },
    );
    return data;
  }

  async recent(): Promise<Notification[]> {
    const { data } = await this.http.request<{ data: Notification[] }>(
      '/api/v1/notifications',
      { authenticated: true },
    );
    return data;
  }

  async unreadCount(): Promise<number> {
    const { data } = await this.http.request<{ data: { count: number } }>(
      '/api/v1/notifications/unread-count',
      { authenticated: true },
    );
    if (!Number.isSafeInteger(data.count) || data.count < 0) {
      throw new Error('Invalid unread count');
    }
    return data.count;
  }

  async read(id: string): Promise<void> {
    if (!id.trim()) {
      throw new Error('Invalid notification ID');
    }
    const { data } = await this.http.request<{
      data: { id: string; read: true };
    }>(`/api/v1/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
      authenticated: true,
      retry: 0,
    });
    if (data.id !== id || data.read !== true) {
      throw new Error('Invalid read confirmation');
    }
  }

  async readAll(): Promise<number> {
    const { data } = await this.http.request<{ data: { updated: number } }>(
      '/api/v1/notifications/read-all',
      { method: 'POST', authenticated: true, retry: 0 },
    );
    if (!Number.isSafeInteger(data.updated) || data.updated < 0) {
      throw new Error('Invalid read-all confirmation');
    }
    return data.updated;
  }
}
