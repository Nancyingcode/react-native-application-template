import { ExecutionQueue, type Receipt } from '../src/core/ota/telemetry';

const context = {
  endpoint: 'https://updates.example.com/v1/apps/app/telemetry',
  token: 'a'.repeat(64),
  installationId: 'installation-test-123',
  attemptId: 'attempt-1',
  releaseId: 'release-1',
  runtimeVersion: 'b'.repeat(64),
  targetVersion: 2,
};
const receipt = (id = 'event-1'): Receipt => ({
  context,
  event: {
    eventId: id,
    protocolVersion: 1,
    kind: 'staged',
    sequence: 20,
    occurredAt: '2026-01-01T00:00:00Z',
    runningVersion: 1,
    highestVersion: 2,
  },
});
function setup() {
  let disk = JSON.stringify({
    installationId: context.installationId,
    queue: [],
  });
  const bridge = {
    readTelemetry: jest.fn(async () => disk),
    writeTelemetry: jest.fn(async (value: string) => {
      disk = value;
      return true;
    }),
    ackTelemetry: jest.fn(async () => true),
    getStatus: jest.fn(async () => '{}'),
  };
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  return {
    bridge,
    fetcher,
    queue: new ExecutionQueue(bridge, fetcher),
    read: () => JSON.parse(disk),
  };
}
const accepted = (ids: string[]) =>
  ({ ok: true, json: async () => ({ accepted: ids }) } as Response);
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

it('persists offline events and retries the original ID after process reconstruction and backoff', async () => {
  const s = setup();
  let now = 100000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  await s.queue.enqueue([receipt()]);
  s.fetcher.mockRejectedValueOnce(new Error('offline'));
  await s.queue.flush();
  expect(s.read().queue).toHaveLength(1);
  expect(s.bridge.ackTelemetry).not.toHaveBeenCalled();
  const restarted = new ExecutionQueue(s.bridge, s.fetcher);
  await restarted.flush();
  expect(s.fetcher).toHaveBeenCalledTimes(1);
  now += 60001;
  s.fetcher.mockResolvedValueOnce(accepted(['event-1']));
  await restarted.flush();
  expect(
    JSON.parse(String(s.fetcher.mock.calls[1][1]?.body)).events[0].eventId,
  ).toBe('event-1');
  expect(s.read().queue).toHaveLength(0);
  expect(s.bridge.ackTelemetry).toHaveBeenCalledWith('["event-1"]');
});
it('retains permanent server rejection without repeatedly sending it', async () => {
  const s = setup();
  await s.queue.enqueue([receipt()]);
  s.fetcher.mockResolvedValueOnce({ ok: false, status: 403 } as Response);
  await s.queue.flush();
  await s.queue.flush();
  expect(s.fetcher).toHaveBeenCalledTimes(1);
  expect(s.read().queue[0].rejected).toBe(true);
  expect(s.bridge.ackTelemetry).not.toHaveBeenCalled();
});
it('only removes IDs explicitly accepted and never erases events enqueued during a request', async () => {
  const s = setup();
  await s.queue.enqueue([receipt()]);
  let resolve!: (value: Response) => void;
  s.fetcher.mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  const sending = s.queue.flush();
  for (let i = 0; i < 10 && !resolve; i++) await Promise.resolve();
  await s.queue.enqueue([receipt('event-2')]);
  // Storage/assignment access completes while the HTTP response is still pending.
  expect(await s.queue.identity()).toBe(context.installationId);
  resolve(accepted(['event-1']));
  await sending;
  expect(s.read().queue.map((item: Receipt) => item.event.eventId)).toEqual([
    'event-2',
  ]);
});
it('bounds the queue, deduplicates native replay and bounds automatic retries', async () => {
  const s = setup();
  let now = 100000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  await s.queue.enqueue(
    Array.from({ length: 80 }, (_, i) => receipt(String(i))),
  );
  await s.queue.enqueue([receipt('0')]);
  expect(s.read().queue).toHaveLength(64);
  s.fetcher.mockRejectedValue(new Error('offline'));
  for (let i = 0; i < 13; i++) {
    await s.queue.flush();
    now += 3600001;
  }
  expect(s.read().queue[0].retries).toBe(12);
  expect(
    s.fetcher.mock.calls.every(
      call => JSON.parse(String(call[1]?.body)).events.length <= 20,
    ),
  ).toBe(true);
});
it('preserves pending events when local acknowledgement or persistence fails', async () => {
  const s = setup();
  await s.queue.enqueue([receipt()]);
  s.fetcher.mockResolvedValueOnce(accepted(['event-1']));
  s.bridge.writeTelemetry.mockRejectedValueOnce(new Error('disk'));
  await expect(s.queue.flush()).rejects.toThrow('disk');
  expect(s.read().queue).toHaveLength(1);
});
it('durably consumes a single assignment per explicit execution attempt', async () => {
  const s = setup();
  await s.queue.remember('https://updates.example.com/release.json', context);
  const restarted = new ExecutionQueue(s.bridge, s.fetcher);
  expect(
    await restarted.take('https://updates.example.com/release.json'),
  ).toEqual(context);
  expect(
    await restarted.take('https://updates.example.com/release.json'),
  ).toBeUndefined();
});
