import {
  startThreadWatchdog,
  type ThreadWatchdogNative,
} from '../src/core/threadWatchdog';
import type { Monitor } from '../src/core/telemetry';

const report = {
  id: 'stall-1',
  thread: 'js',
  detectedAt: 10000,
  durationMs: 5000,
  thresholdMs: 5000,
};

let native: jest.Mocked<ThreadWatchdogNative>;
let monitor: Monitor;
let stop: (() => void) | undefined;

beforeEach(() => {
  jest.useFakeTimers();
  native = {
    start: jest.fn(),
    stop: jest.fn(),
    heartbeat: jest.fn(),
    getReports: jest.fn().mockResolvedValue('[]'),
    acknowledgeReports: jest.fn(),
  };
  monitor = { capture: jest.fn(), measure: jest.fn() };
});

afterEach(() => {
  stop?.();
  stop = undefined;
  jest.useRealTimers();
});

test('development builds leave the watchdog disabled by default', () => {
  stop = startThreadWatchdog(monitor, undefined, native);
  expect(native.start).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('sends independent heartbeats and cleans up timers on disposal', async () => {
  stop = startThreadWatchdog(monitor, true, native);
  expect(native.start).toHaveBeenCalledTimes(1);
  expect(native.heartbeat).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(3000);
  expect(native.heartbeat).toHaveBeenCalledTimes(4);
  stop();
  stop = undefined;
  await jest.advanceTimersByTimeAsync(10000);
  expect(native.heartbeat).toHaveBeenCalledTimes(4);
  expect(native.stop).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('delivers persisted stalls from both threads before acknowledging exact IDs', async () => {
  const main = {
    ...report,
    id: 'stall-2',
    thread: 'native_main',
    stack: 'main',
  };
  native.getReports.mockResolvedValueOnce(JSON.stringify([report, main]));
  stop = startThreadWatchdog(monitor, true, native);
  await jest.advanceTimersByTimeAsync(0);
  expect(monitor.capture).toHaveBeenCalledWith(expect.any(Error), {
    source: 'thread_watchdog',
    ...report,
  });
  expect(monitor.capture).toHaveBeenCalledWith(expect.any(Error), {
    source: 'thread_watchdog',
    ...main,
  });
  expect(native.acknowledgeReports).toHaveBeenCalledWith(
    '["stall-1","stall-2"]',
  );
  expect(jest.mocked(monitor.capture).mock.invocationCallOrder[1]).toBeLessThan(
    native.acknowledgeReports.mock.invocationCallOrder[0],
  );
});

test('failed reads retain reports and retry without interrupting heartbeats', async () => {
  native.getReports.mockRejectedValueOnce(new Error('read failed'));
  stop = startThreadWatchdog(monitor, true, native);
  await jest.advanceTimersByTimeAsync(0);
  expect(native.acknowledgeReports).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(5000);
  expect(native.getReports).toHaveBeenCalledTimes(2);
  expect(native.heartbeat).toHaveBeenCalledTimes(6);
});

test('a pending read does not overlap and cannot acknowledge after disposal', async () => {
  let complete!: (reports: string) => void;
  native.getReports.mockReturnValue(
    new Promise(resolve => {
      complete = resolve;
    }),
  );
  stop = startThreadWatchdog(monitor, true, native);
  await jest.advanceTimersByTimeAsync(15000);
  expect(native.getReports).toHaveBeenCalledTimes(1);
  expect(native.heartbeat).toHaveBeenCalledTimes(16);
  stop();
  stop = undefined;
  complete(JSON.stringify([report]));
  await jest.advanceTimersByTimeAsync(0);
  expect(monitor.capture).not.toHaveBeenCalled();
  expect(native.acknowledgeReports).not.toHaveBeenCalled();
});

test('delivery failures do not acknowledge the stored reports', async () => {
  native.getReports.mockResolvedValueOnce(JSON.stringify([report]));
  jest.mocked(monitor.capture).mockImplementationOnce(() => {
    throw new Error('delivery failed');
  });
  stop = startThreadWatchdog(monitor, true, native);
  await jest.advanceTimersByTimeAsync(0);
  expect(native.acknowledgeReports).not.toHaveBeenCalled();
});
