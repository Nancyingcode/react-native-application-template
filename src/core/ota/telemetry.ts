import { AppState, NativeModules } from 'react-native';
import { ConsoleLogger } from '../logger';
import type { OtaStatus } from './types';
import type { UpdateResult } from './query';

import {
  ExecutionQueue,
  type Assignment,
  type NativeTelemetry,
} from './executionQueue';
export { ExecutionQueue } from './executionQueue';
export type { Receipt } from './executionQueue';
const logger = new ConsoleLogger({ component: 'ota_telemetry' });
const native = () => NativeModules.OtaBundle as NativeTelemetry | undefined;

let queue: ExecutionQueue | undefined;
function getQueue() {
  const bridge = native();
  if (!bridge?.readTelemetry) return undefined;
  queue ??= new ExecutionQueue(bridge);
  return queue;
}
export async function telemetryIdentity(): Promise<string | undefined> {
  try {
    return await getQueue()?.identity();
  } catch {
    return undefined;
  }
}
export async function rememberAssignment(
  endpoint: string,
  status: OtaStatus,
  result: UpdateResult,
  installationId?: string,
) {
  if (!result.updateAvailable || !result.telemetry || !installationId) return;
  const url = new URL(endpoint);
  if (!/\/v1\/apps\/[a-f0-9-]+\/updates$/.test(url.pathname)) return;
  const context: Assignment = {
    endpoint: url.origin + url.pathname.replace(/\/updates$/, '/telemetry'),
    attemptId: result.telemetry.attemptId,
    releaseId: result.telemetry.releaseId,
    token: result.telemetry.token,
    runtimeVersion: status.runtimeVersion,
    targetVersion: result.bundleVersion,
    installationId,
  };
  try {
    await getQueue()?.remember(result.manifestUrl, context);
  } catch {
    logger.log('warn', 'OTA assignment persistence failed');
  }
}
export async function takeAssignment(url: string) {
  try {
    return await getQueue()?.take(url);
  } catch {
    return undefined;
  }
}
export async function collectTelemetry() {
  try {
    const bridge = native();
    if (!bridge?.readTelemetry) return;
    const status = JSON.parse(await bridge.getStatus()) as OtaStatus;
    if (status.droppedReceipts)
      logger.log('warn', 'OTA native receipt capacity exceeded', {
        dropped: status.droppedReceipts,
      });
    await getQueue()?.enqueue(status.receipts ?? []);
    await getQueue()?.flush();
  } catch {
    logger.log('warn', 'OTA telemetry unavailable');
  }
}
export function startOtaTelemetry() {
  if (!native()?.readTelemetry) return () => undefined;
  collectTelemetry().catch(() => undefined);
  const timer = setInterval(() => {
    if (AppState.currentState === 'active')
      collectTelemetry().catch(() => undefined);
  }, 30000);
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active') collectTelemetry().catch(() => undefined);
  });
  return () => {
    clearInterval(timer);
    subscription.remove();
  };
}
