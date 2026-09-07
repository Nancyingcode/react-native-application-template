export interface BundleManifest {
  schemaVersion: 1;
  platform: 'android' | 'ios';
  brandId: string;
  environment: string;
  channel: string;
  appVersion: string;
  buildNumber: number;
  baseVersion: string;
  nativeFingerprint: string;
  assetsFingerprint: string;
  runtimeVersion: string;
  bundleVersion: number;
  businessSha256: string;
  businessBytes: number;
  businessUrl?: string;
  createdAt?: string;
  releaseNotes?: string;
}

export interface OtaStatus {
  supported: boolean;
  runtimeVersion: string;
  baseVersion: string;
  currentVersion: number;
  pendingVersion: number;
  previousVersion: number;
  failedVersion: number;
  highestVersion: number;
}
