import {
  AnalyticsService,
  HttpAnalyticsTransport,
  type AnalyticsEvent,
  type AnalyticsTransport,
} from '../src/core/telemetry';
import type { Logger } from '../src/core/logger';

function createLogger(): Logger {
  return {
    log: jest.fn(),
    child: jest.fn(),
  } as unknown as Logger;
}

function createAnalytics(transport: AnalyticsTransport): AnalyticsService {
  let id = 0;
  return new AnalyticsService({
    transport,
    logger: createLogger(),
    now: () => Date.parse('2026-08-25T01:02:03.000Z'),
    createId: () => `id-${++id}`,
    context: {
      app: { id: 'test', name: 'Test App', version: '1.0.0' },
      device: { platform: 'test', osVersion: '1' },
      locale: 'zh-CN',
      timezone: 'Asia/Hong_Kong',
      channel: { id: 'direct' },
    },
  });
}

describe('AnalyticsService', () => {
  it('does not collect before consent', async () => {
    const send = jest.fn(async (_events: AnalyticsEvent[]) => undefined);
    const analytics = createAnalytics({ send });

    analytics.track('order_submitted', { orderId: 'order-1' });
    await analytics.flush();

    expect(send).not.toHaveBeenCalled();
  });

  it('uses a standard event envelope and redacts sensitive properties', async () => {
    const send = jest.fn(async (_events: AnalyticsEvent[]) => undefined);
    const analytics = createAnalytics({ send });

    analytics.setConsent(true);
    analytics.identify('user-1', {
      email: 'person@example.test',
      tier: 'gold',
    });
    analytics.screen('Portfolio', {
      source: 'menu',
      nested: { accessToken: 'secret', visible: true },
    });
    await analytics.flush();

    const events = send.mock.calls[0][0];
    expect(events.map(event => event.type)).toEqual([
      'track',
      'identify',
      'screen',
    ]);
    expect(events[2]).toMatchObject({
      schemaVersion: 1,
      messageId: 'id-5',
      type: 'screen',
      name: 'Portfolio',
      timestamp: '2026-08-25T01:02:03.000Z',
      anonymousId: 'id-1',
      userId: 'user-1',
      context: {
        app: { id: 'test', name: 'Test App', version: '1.0.0' },
        sessionId: 'id-2',
      },
      properties: {
        source: 'menu',
        nested: { accessToken: '[REDACTED]', visible: true },
      },
    });
    expect(events[1].traits).toEqual({
      email: '[REDACTED]',
      tier: 'gold',
    });
  });

  it('puts a failed batch back in the queue for retry', async () => {
    const send = jest
      .fn<Promise<void>, [AnalyticsEvent[]]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const analytics = createAnalytics({ send });

    analytics.setConsent(true);
    analytics.track('trade_confirmed', { symbol: 'TEST' });
    await expect(analytics.flush()).rejects.toThrow('offline');
    const firstBatch = send.mock.calls[0][0];

    await analytics.flush();

    expect(send.mock.calls[1][0]).toEqual(firstBatch);
  });

  it('uses the active locale for new events', async () => {
    const send = jest.fn(async (_events: AnalyticsEvent[]) => undefined);
    const analytics = createAnalytics({ send });

    analytics.setLocale('en-US');
    analytics.setConsent(true);
    await analytics.flush();

    expect(send.mock.calls[0][0][0].context.locale).toBe('en-US');
  });

  it('does not restore an in-flight batch after consent is revoked', async () => {
    let rejectSend: (error: Error) => void = () => undefined;
    const send = jest.fn(
      (_events: AnalyticsEvent[]) =>
        new Promise<void>((_resolve, reject) => {
          rejectSend = reject;
        }),
    );
    const analytics = createAnalytics({ send });

    analytics.setConsent(true);
    const flushing = analytics.flush();
    analytics.setConsent(false);
    rejectSend(new Error('offline'));
    await expect(flushing).rejects.toThrow('offline');

    send.mockResolvedValue(undefined);
    analytics.setConsent(true);
    await analytics.flush();

    expect(send.mock.calls[1][0]).toHaveLength(1);
    expect(send.mock.calls[1][0][0].messageId).toBe('id-4');
  });
});

describe('HttpAnalyticsTransport', () => {
  it('posts events as a batch', async () => {
    const fetcher = jest.fn(
      async (_input: string, _init?: RequestInit) => ({ ok: true } as Response),
    );
    const transport = new HttpAnalyticsTransport({
      endpoint: 'https://analytics.example.test/v1/events',
      timeoutMs: 1000,
      apiKey: 'key-1',
      fetcher: fetcher as typeof fetch,
    });
    const event = {
      schemaVersion: 1,
      messageId: 'event-1',
      type: 'track',
      event: 'test_event',
      timestamp: '2026-08-25T01:02:03.000Z',
      anonymousId: 'anonymous-1',
      context: {},
      properties: {},
    } as unknown as AnalyticsEvent;

    await transport.send([event]);

    expect(fetcher).toHaveBeenCalledWith(
      'https://analytics.example.test/v1/events',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"batch"'),
      }),
    );
    const request = fetcher.mock.calls[0][1];
    expect((request?.headers as Headers).get('X-Analytics-Key')).toBe('key-1');
  });
});
