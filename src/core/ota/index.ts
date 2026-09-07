import { NativeModules } from 'react-native';
import type { OtaStatus } from './types';

interface OtaNativeModule {
  getStatus(): Promise<string>;
  stage(manifestUrl: string): Promise<number>;
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
    return nativeModule().stage(manifestUrl);
  },
  async markSuccessful(): Promise<void> {
    if (!__DEV__) await nativeModule().markSuccessful();
  },
};
