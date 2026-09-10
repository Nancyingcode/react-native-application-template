import { queryUpdate } from '../src/core/ota/query';
import type { OtaStatus } from '../src/core/ota/types';

const status: OtaStatus = {
  supported: true,
  runtimeVersion: 'a'.repeat(64),
  baseVersion: 'b'.repeat(64),
  currentVersion: 1,
  highestVersion: 3,
  failedVersion: 3,
  pendingVersion: 0,
  previousVersion: 0,
};
const endpoint = 'https://updates.example.com/v1/apps/app-id/updates';
afterEach(() => jest.restoreAllMocks());

it('queries the native high-water mark without admin credentials and resolves the manifest from the origin', async () => {
  const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        updateAvailable: true,
        bundleVersion: 4,
        manifestUrl: '/v1/apps/app-id/updates/release-id/release.json',
      }),
    ),
  );
  await expect(queryUpdate(endpoint, status)).resolves.toEqual({
    updateAvailable: true,
    bundleVersion: 4,
    manifestUrl:
      'https://updates.example.com/v1/apps/app-id/updates/release-id/release.json',
  });
  expect(fetcher).toHaveBeenCalledWith(
    `${endpoint}?runtimeVersion=${status.runtimeVersion}&currentVersion=3`,
    { signal: expect.anything() },
  );
});

it('handles no update and rejects failed versions, malformed responses and foreign origins', async () => {
  const fetcher = jest.spyOn(global, 'fetch');
  fetcher.mockResolvedValueOnce(new Response('{"updateAvailable":false}'));
  await expect(queryUpdate(endpoint, status)).resolves.toEqual({
    updateAvailable: false,
  });
  for (const data of [
    null,
    {},
    { updateAvailable: true, bundleVersion: 3, manifestUrl: '/release.json' },
    {
      updateAvailable: true,
      bundleVersion: 4,
      manifestUrl: 'https://other.example.com/release.json',
    },
  ]) {
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
    await expect(queryUpdate(endpoint, status)).rejects.toThrow();
  }
});

it('rejects unsupported builds and insecure endpoints before making a request; surfaces HTTP errors', async () => {
  const fetcher = jest.spyOn(global, 'fetch');
  await expect(
    queryUpdate(endpoint, { ...status, supported: false }),
  ).rejects.toThrow();
  await expect(
    queryUpdate(endpoint.replace('https:', 'http:'), status),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(new Response('', { status: 503 }));
  await expect(queryUpdate(endpoint, status)).rejects.toThrow(
    'OTA query failed',
  );
});
