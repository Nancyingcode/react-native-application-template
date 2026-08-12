import type {Logger} from './logger';

export interface Analytics {
  setConsent(enabled: boolean): void;
  track(name: string, properties?: Record<string, unknown>): void;
}

export class ConsentAwareAnalytics implements Analytics {
  private enabled = false;
  constructor(private readonly logger: Logger) {}
  setConsent(enabled: boolean): void {
    this.enabled = enabled;
  }
  track(name: string, properties: Record<string, unknown> = {}): void {
    if (this.enabled) {
      this.logger.log('info', `analytics:${name}`, properties);
    }
  }
}

export interface Monitor {
  capture(error: unknown, context?: Record<string, unknown>): void;
  measure<T>(name: string, operation: () => Promise<T>): Promise<T>;
}

export class AppMonitor implements Monitor {
  constructor(private readonly logger: Logger) {}
  capture(error: unknown, context: Record<string, unknown> = {}): void {
    this.logger.log('error', 'monitor.capture', {error, ...context});
  }
  async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      return await operation();
    } catch (error) {
      this.capture(error, {operation: name});
      throw error;
    } finally {
      this.logger.log('info', 'performance.measure', {
        operation: name,
        durationMs: Date.now() - startedAt,
      });
    }
  }
}
