import type { OtaStatus } from './types';

export type UpdateResult =
  | { updateAvailable: false }
  | {
      updateAvailable: true;
      bundleVersion: number;
      manifestUrl: string;
      telemetry?: {
        protocolVersion: 1;
        attemptId: string;
        releaseId: string;
        token: string;
      };
    };

export async function queryUpdate(
  endpoint: string,
  status: OtaStatus,
  installationId?: string,
): Promise<UpdateResult> {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error('Invalid OTA query URL');
  }
  if (!status.supported || !/^[a-f0-9]{64}$/.test(status.runtimeVersion)) {
    throw new Error('OTA is unavailable in this build');
  }
  // The native high-water mark also excludes failed or already staged versions.
  const currentVersion = Math.max(status.currentVersion, status.highestVersion);
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new Error('Invalid OTA version');
  }
  url.searchParams.set('runtimeVersion', status.runtimeVersion);
  url.searchParams.set('currentVersion', String(currentVersion));
  if (installationId && status.telemetryVersion === 1) {
    url.searchParams.set('installationId', installationId);
    url.searchParams.set('highestVersion', String(status.highestVersion));
    url.searchParams.set('currentVersion', String(status.currentVersion));
    url.searchParams.set('telemetryVersion', '1');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) throw new Error('OTA query failed');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('updateAvailable' in data)) {
      throw new Error('Invalid OTA response');
    }
    if (data.updateAvailable === false) return { updateAvailable: false };
    if (
      data.updateAvailable !== true ||
      !('bundleVersion' in data) ||
      typeof data.bundleVersion !== 'number' ||
      !Number.isInteger(data.bundleVersion) ||
      data.bundleVersion <= currentVersion ||
      data.bundleVersion > 2100000000 ||
      !('manifestUrl' in data) ||
      typeof data.manifestUrl !== 'string'
    ) {
      throw new Error('Invalid OTA response');
    }
    // RN appends relative paths to the base path; remove this workaround when its URL resolver follows WHATWG.
    const manifestAddress =
      data.manifestUrl.startsWith('/') && !data.manifestUrl.startsWith('//')
        ? url.origin + data.manifestUrl
        : data.manifestUrl;
    const manifest = new URL(manifestAddress);
    if (
      manifest.origin !== url.origin ||
      manifest.username ||
      manifest.password ||
      manifest.hash
    ) {
      throw new Error('Invalid OTA manifest URL');
    }
    let telemetry: Extract<
      UpdateResult,
      { updateAvailable: true }
    >['telemetry'];
    if (
      'telemetry' in data &&
      data.telemetry &&
      typeof data.telemetry === 'object'
    ) {
      const value = data.telemetry as Record<string, unknown>;
      const uuid =
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
      if (
        value.protocolVersion !== 1 ||
        typeof value.attemptId !== 'string' ||
        !uuid.test(value.attemptId) ||
        typeof value.releaseId !== 'string' ||
        !uuid.test(value.releaseId) ||
        typeof value.token !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.token)
      ) {
        throw new Error('Invalid OTA assignment');
      }
      telemetry = {
        protocolVersion: 1,
        attemptId: value.attemptId,
        releaseId: value.releaseId,
        token: value.token,
      };
    }
    return {
      updateAvailable: true,
      bundleVersion: data.bundleVersion,
      manifestUrl: manifest.toString(),
      ...(telemetry ? { telemetry } : {}),
    };
  } finally {
    clearTimeout(timer);
  }
}
