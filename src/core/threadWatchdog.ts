import { NativeModules } from 'react-native';
import type { Monitor } from './telemetry';

export interface ThreadWatchdogNative {
  start(): void;
  stop(): void;
  heartbeat(): void;
  getReports(): Promise<string>;
  acknowledgeReports(ids: string): void;
}

interface StallReport {
  id: string;
  thread: 'js' | 'native_main';
  detectedAt: number;
  durationMs: number;
  thresholdMs: number;
  stack?: string;
}

export function startThreadWatchdog(
  monitor: Monitor,
  enabled = !__DEV__,
  nativeModule?: ThreadWatchdogNative,
): () => void {
  if (!enabled) return () => {};
  const native: ThreadWatchdogNative | undefined =
    nativeModule ?? NativeModules.ThreadWatchdog;
  if (!native) {
    monitor.capture(new Error('ThreadWatchdog native module is not available'));
    return () => {};
  }

  let stopped = false;
  let reading = false;
  const readReports = async (): Promise<void> => {
    if (reading || stopped) return;
    reading = true;
    try {
      const reports: StallReport[] = JSON.parse(await native.getReports());
      if (stopped) return;
      for (const report of reports) {
        monitor.capture(new Error(`${report.thread} thread unresponsive`), {
          source: 'thread_watchdog',
          ...report,
        });
      }
      // 原生保留记录直到交给现有监控；这不是服务端上传成功确认。
      if (reports.length > 0) {
        native.acknowledgeReports(JSON.stringify(reports.map(item => item.id)));
      }
    } catch (error) {
      if (!stopped) {
        monitor.capture(error, { source: 'thread_watchdog_read' });
      }
    } finally {
      reading = false;
    }
  };

  native.start();
  native.heartbeat();
  readReports();
  const heartbeat = setInterval(() => native.heartbeat(), 1000);
  const reports = setInterval(readReports, 5000);
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    clearInterval(reports);
    native.stop();
  };
}
