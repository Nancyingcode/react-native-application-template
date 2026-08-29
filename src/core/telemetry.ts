import type { Logger } from './logger';

export type AnalyticsProperties = Record<string, unknown>;
export type AnalyticsEventType = 'track' | 'screen' | 'identify';

export interface AnalyticsContext extends AnalyticsProperties {
  app: { id: string; name: string; version: string };
  device: { platform: string; osVersion: string };
  locale: string;
  timezone: string;
  channel: { id: string; campaign?: string };
  sessionId: string;
}

export interface AnalyticsEvent {
  schemaVersion: 1;
  messageId: string;
  type: AnalyticsEventType;
  event?: string;
  name?: string;
  timestamp: string;
  anonymousId: string;
  userId?: string;
  context: AnalyticsContext;
  properties?: AnalyticsProperties;
  traits?: AnalyticsProperties;
}

export interface AnalyticsTransport {
  send(events: AnalyticsEvent[]): Promise<void>;
}

export interface HttpAnalyticsTransportConfig {
  endpoint: string;
  timeoutMs: number;
  apiKey?: string;
  fetcher?: typeof fetch;
}

export class HttpAnalyticsTransport implements AnalyticsTransport {
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: HttpAnalyticsTransportConfig) {
    this.fetcher = config.fetcher ?? fetch;
  }

  async send(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const headers = new Headers({
        Accept: 'application/json',
        'Content-Type': 'application/json',
      });
      if (this.config.apiKey) {
        headers.set('X-Analytics-Key', this.config.apiKey);
      }
      const response = await this.fetcher(this.config.endpoint, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          batch: events,
          sentAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        throw new Error(`Analytics request failed with ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

export interface Analytics {
  setLocale(locale: string): void;
  setConsent(enabled: boolean): void;
  identify(userId: string, traits?: AnalyticsProperties): void;
  reset(): void;
  track(name: string, properties?: AnalyticsProperties): void;
  screen(name: string, properties?: AnalyticsProperties): void;
  flush(): Promise<void>;
}

export interface AnalyticsServiceConfig {
  context: Omit<AnalyticsContext, 'sessionId'>;
  transport: AnalyticsTransport;
  logger: Logger;
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  now?: () => number;
  createId?: () => string;
}

const SENSITIVE_FIELD =
  /authorization|cookie|password|secret|token|account|card|email|phone|mobile|identity/i;
const EVENT_NAME = /^[a-zA-Z][a-zA-Z0-9_.-]{0,99}$/;

export class AnalyticsService implements Analytics {
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueueSize: number;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly anonymousId: string;
  private sessionId: string;
  private enabled = false;
  private userId?: string;
  private locale: string;
  private queue: AnalyticsEvent[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;
  private activeFlush?: Promise<void>;

  constructor(private readonly config: AnalyticsServiceConfig) {
    this.batchSize = Math.max(1, config.batchSize ?? 20);
    this.flushIntervalMs = Math.max(1000, config.flushIntervalMs ?? 15_000);
    this.maxQueueSize = Math.max(this.batchSize, config.maxQueueSize ?? 500);
    this.now = config.now ?? Date.now;
    this.createId = config.createId ?? createId;
    this.anonymousId = this.createId();
    this.sessionId = this.createId();
    this.locale = String(config.context.locale);
  }

  setLocale(locale: string): void {
    this.locale = locale;
  }

  setConsent(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.queue = [];
      this.clearFlushTimer();
      return;
    }
    this.track('analytics_consent_granted');
  }

  identify(userId: string, traits: AnalyticsProperties = {}): void {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      this.config.logger.log('warn', 'Analytics identify ignored', {
        reason: 'empty-user-id',
      });
      return;
    }
    this.userId = normalizedUserId;
    this.enqueue('identify', undefined, traits);
  }

  reset(): void {
    this.userId = undefined;
    this.sessionId = this.createId();
  }

  track(name: string, properties: AnalyticsProperties = {}): void {
    this.enqueue('track', name, properties);
  }

  screen(name: string, properties: AnalyticsProperties = {}): void {
    this.enqueue('screen', name, properties);
  }

  flush(): Promise<void> {
    if (!this.enabled || this.queue.length === 0) {
      return Promise.resolve();
    }
    if (this.activeFlush) {
      return this.activeFlush;
    }

    this.clearFlushTimer();
    this.activeFlush = this.drainQueue().finally(() => {
      this.activeFlush = undefined;
      if (this.queue.length > 0) {
        this.scheduleFlush();
      }
    });
    return this.activeFlush;
  }

  private async drainQueue(): Promise<void> {
    while (this.enabled && this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      try {
        await this.config.transport.send(batch);
      } catch (error) {
        if (this.enabled) {
          // 保留事件顺序可让服务端的 messageId 幂等去重保持确定性；溢出时丢弃最新事件。
          this.queue = [...batch, ...this.queue].slice(0, this.maxQueueSize);
        }
        this.config.logger.log('warn', 'Analytics batch upload failed', {
          eventCount: batch.length,
          error,
        });
        throw error;
      }
    }
  }

  private enqueue(
    type: AnalyticsEventType,
    name: string | undefined,
    properties: AnalyticsProperties,
  ): void {
    if (!this.enabled) {
      return;
    }
    const normalizedName = name?.trim();
    if (
      type !== 'identify' &&
      (!normalizedName || !EVENT_NAME.test(normalizedName))
    ) {
      this.config.logger.log('warn', 'Analytics event ignored', {
        reason: 'invalid-event-name',
      });
      return;
    }

    const event: AnalyticsEvent = {
      schemaVersion: 1,
      messageId: this.createId(),
      type,
      ...(type === 'screen' ? { name: normalizedName } : {}),
      ...(type === 'track' ? { event: normalizedName } : {}),
      timestamp: new Date(this.now()).toISOString(),
      anonymousId: this.anonymousId,
      ...(this.userId ? { userId: this.userId } : {}),
      context: sanitizeProperties({
        ...this.config.context,
        locale: this.locale,
        sessionId: this.sessionId,
      }) as AnalyticsContext,
      ...(type === 'identify'
        ? { traits: sanitizeProperties(properties) }
        : { properties: sanitizeProperties(properties) }),
    };
    this.queue.push(event);
    if (this.queue.length > this.maxQueueSize) {
      this.queue.shift();
      this.config.logger.log('warn', 'Analytics queue limit reached', {
        maxQueueSize: this.maxQueueSize,
      });
    }

    if (this.queue.length >= this.batchSize) {
      this.flush().catch(() => undefined);
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer || !this.enabled || this.queue.length === 0) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flush().catch(() => undefined);
    }, this.flushIntervalMs);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }
}

export interface Monitor {
  capture(error: unknown, context?: Record<string, unknown>): void;
  measure<T>(name: string, operation: () => Promise<T>): Promise<T>;
}

export class AppMonitor implements Monitor {
  constructor(
    private readonly logger: Logger,
    private readonly analytics?: Analytics,
  ) {}

  capture(error: unknown, context: Record<string, unknown> = {}): void {
    this.logger.log('error', 'monitor.capture', { error, ...context });
    const normalizedError = normalizeError(error);
    this.analytics?.track('app_error', { ...normalizedError, ...context });
  }

  async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    let success = false;
    try {
      const result = await operation();
      success = true;
      return result;
    } catch (error) {
      this.capture(error, { operation: name });
      throw error;
    } finally {
      const durationMs = Date.now() - startedAt;
      this.logger.log('info', 'performance.measure', {
        operation: name,
        durationMs,
      });
      this.analytics?.track('performance_measure', {
        operation: name,
        durationMs,
        success,
      });
    }
  }
}

function sanitizeProperties(
  properties: AnalyticsProperties,
): AnalyticsProperties {
  return sanitizeValue(properties, new WeakSet()) as AnalyticsProperties;
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return normalizeError(value);
  }
  if (typeof value !== 'object' || value === undefined) {
    return String(value);
  }
  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const sanitized = value.map(item => sanitizeValue(item, seen));
    seen.delete(value);
    return sanitized;
  }
  const sanitized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_FIELD.test(key) ? '[REDACTED]' : sanitizeValue(item, seen),
    ]),
  );
  seen.delete(value);
  return sanitized;
}

function normalizeError(error: unknown): AnalyticsProperties {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorName: 'UnknownError', errorMessage: String(error) };
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}
