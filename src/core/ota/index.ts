import { NativeModules } from 'react-native';
import type { OtaStatus } from './types';
import { takeAssignment, collectTelemetry } from './telemetry';

interface OtaNativeModule {
  getStatus(): Promise<string>;
  stage(manifestUrl: string): Promise<number>;
  stageTracked?(manifestUrl: string, context: string): Promise<number>;
  markSuccessful(): Promise<boolean>;
}

function nativeModule(): OtaNativeModule {
  const module = NativeModules.OtaBundle as OtaNativeModule | undefined;
  if (!module) throw new Error('OTA native module is not available');
  return module;
}

export const ota = {
  async getStatus(): Promise<OtaStatus> {
    return JSON.parse(await nativeModule().getStatus()) as OtaStatus;
  },
  async stage(manifestUrl: string): Promise<number> {
    if (!/^https:\/\//.test(manifestUrl))
      throw new Error('OTA manifest URL must use HTTPS');
    const module = nativeModule();
    const context = await takeAssignment(manifestUrl);
    if (!context || !module.stageTracked) return module.stage(manifestUrl);
    try {
      return await module.stageTracked(manifestUrl, JSON.stringify(context));
    } finally {
      collectTelemetry().catch(() => undefined);
    }
  },
  async markSuccessful(): Promise<void> {
    if (!__DEV__) {
      await nativeModule().markSuccessful();
      collectTelemetry().catch(() => undefined);
    }
  },
};
