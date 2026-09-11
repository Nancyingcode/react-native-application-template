import { ConsoleLogger } from '../logger';

export interface Assignment {
  endpoint: string;
  attemptId: string;
  releaseId: string;
  token: string;
  installationId: string;
  runtimeVersion: string;
  targetVersion: number;
}
export interface ExecutionEvent {
  eventId: string;
  protocolVersion: 1;
  sequence: number;
  kind: string;
  occurredAt: string;
  runningVersion: number | null;
  highestVersion: number;
  errorCode?: string;
}
export interface Receipt {
  context: Assignment;
  event: ExecutionEvent;
}
interface Entry extends Receipt {
  retries: number;
  nextAt: number;
  rejected?: boolean;
}
interface Stored {
  installationId: string;
  queue: Entry[];
  assignments?: Record<string, Assignment>;
}
export interface NativeTelemetry {
  readTelemetry(): Promise<string>;
  writeTelemetry(value: string): Promise<boolean>;
  ackTelemetry(value: string): Promise<boolean>;
  getStatus(): Promise<string>;
}
const logger = new ConsoleLogger({ component: 'ota_telemetry' });

// One serialized writer prevents flush acknowledgements from erasing newly queued events.
export class ExecutionQueue {
  private pending: Promise<unknown> = Promise.resolve();
  private sending = false;
  constructor(
    private bridge: NativeTelemetry,
    private fetcher: typeof fetch = fetch,
  ) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.pending.then(work);
    this.pending = result.catch(() => undefined);
    return result;
  }
  private async read(): Promise<Stored> {
    const value = JSON.parse(await this.bridge.readTelemetry()) as Stored;
    if (!value.installationId || !Array.isArray(value.queue))
      throw new Error('Invalid telemetry storage');
    return value;
  }
  identity() {
    return this.serial(async () => (await this.read()).installationId);
  }
  remember(url: string, context: Assignment) {
    return this.serial(async () => {
      const state = await this.read();
      const entries = Object.entries(state.assignments ?? {})
        .filter(([key]) => key !== url)
        .slice(-7);
      state.assignments = Object.fromEntries([...entries, [url, context]]);
      await this.bridge.writeTelemetry(JSON.stringify(state));
    });
  }
  take(url: string) {
    return this.serial(async () => {
      const state = await this.read();
      const context = state.assignments?.[url];
      delete state.assignments?.[url];
      await this.bridge.writeTelemetry(JSON.stringify(state));
      return context;
    });
  }
  enqueue(receipts: Receipt[]) {
    return this.serial(async () => {
      const state = await this.read();
      for (const receipt of receipts) {
        if (
          state.queue.some(item => item.event.eventId === receipt.event.eventId)
        )
          continue;
        if (state.queue.length >= 64) {
          logger.log('warn', 'OTA queue capacity reached', {
            pending: state.queue.length,
          });
          break;
        }
        state.queue.push({ ...receipt, retries: 0, nextAt: 0 });
      }
      logger.log('debug', 'OTA telemetry queue', {
        pending: state.queue.length,
        rejected: state.queue.filter(item => item.rejected).length,
        exhausted: state.queue.filter(item => item.retries >= 12).length,
      });
      await this.bridge.writeTelemetry(JSON.stringify(state));
    });
  }
  async flush() {
    if (this.sending) return;
    this.sending = true;
    try {
      const batch = await this.serial(async () => {
        const state = await this.read();
        const now = Date.now();
        const eligible = (item: Entry) =>
          !item.rejected &&
          item.retries < 12 &&
          (item.nextAt <= now || item.nextAt - now > 3600000);
        const first = state.queue.find(eligible);
        if (!first) return [];
        return state.queue
          .filter(
            item =>
              item.context.attemptId === first.context.attemptId &&
              eligible(item),
          )
          .slice(0, 20);
      });
      if (!batch.length) return;
      const { endpoint, token, ...scope } = batch[0].context;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      let accepted: string[] = [];
      let rejected = false;
      try {
        const response = await this.fetcher(endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...scope,
            events: batch.map(item => item.event),
          }),
        });
        if (!response.ok) {
          const permanent =
            response.status >= 400 &&
            response.status < 500 &&
            ![408, 429].includes(response.status);
          rejected = permanent;
          throw new Error('Telemetry rejected');
        }
        const result = (await response.json()) as { accepted?: string[] };
        if (
          !Array.isArray(result.accepted) ||
          !result.accepted.every(id => typeof id === 'string')
        )
          throw new Error('Invalid telemetry acknowledgement');
        accepted = batch
          .map(item => item.event.eventId)
          .filter(id => result.accepted?.includes(id));
        // Native acknowledgement also occurs only after server acceptance. Retrying is idempotent.
        await this.bridge.ackTelemetry(JSON.stringify(accepted));
      } catch {
        logger.log('warn', 'OTA report deferred', {
          batchSize: batch.length,
          rejected,
        });
      } finally {
        clearTimeout(timer);
        // Network I/O stays outside the storage lock so reporting never delays OTA execution.
        await this.serial(async () => {
          const state = await this.read();
          state.queue = state.queue.filter(
            item => !accepted.includes(item.event.eventId),
          );
          state.queue.forEach(item => {
            if (!batch.some(sent => sent.event.eventId === item.event.eventId))
              return;
            item.rejected = rejected;
            item.retries = Math.min(item.retries + 1, 12);
            item.nextAt =
              Date.now() + Math.min(3600000, 30000 * 2 ** item.retries);
          });
          await this.bridge.writeTelemetry(JSON.stringify(state));
        });
      }
    } finally {
      this.sending = false;
    }
  }
}
