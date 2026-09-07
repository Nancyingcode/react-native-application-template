import fs from 'node:fs';
import path from 'node:path';
import { readBrand } from '../scripts/brand-utils';
import { parsePackageOptions } from '../scripts/package/cli';
import {
  publishArtifact,
  resolveArtifactLayout,
} from '../scripts/package/artifact';
import {
  copyBundleArtifacts,
  REQUIRED_BUNDLE_FILES,
} from '../scripts/package/bundles';
import type { PackageContext } from '../scripts/package/types';

const cli = parsePackageOptions(['--unsigned'], {});
if (cli.help) throw new Error('Expected build options');
const context: PackageContext = {
  options: cli.options,
  brand: readBrand('aurora').config,
  env: {},
  layout: resolveArtifactLayout(cli.options),
  sourceState: { commit: null, dirty: null },
};

function publish() {
  return publishArtifact(
    'native.aab',
    context.options,
    context.brand,
    context.layout,
    context.sourceState,
  );
}

afterEach(() => jest.restoreAllMocks());

function mockPublication(existing: string) {
  jest
    .spyOn(fs, 'statSync')
    .mockReturnValue({ isFile: () => true, size: 12 } as fs.Stats);
  jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
  jest.spyOn(fs, 'copyFileSync').mockImplementation(() => undefined);
  jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  jest.spyOn(fs, 'readFileSync').mockImplementation(file => {
    if (file === context.layout.manifestPath) return existing;
    if (String(file).endsWith('bundle-manifest.json')) return '{"version":1}';
    return Buffer.from('native bytes');
  });
  const write = jest
    .spyOn(fs, 'writeFileSync')
    .mockImplementation(() => undefined);
  const rename = jest
    .spyOn(fs, 'renameSync')
    .mockImplementation(() => undefined);
  return { write, rename };
}

test('invalid existing manifest fails with its path and preserves the original', () => {
  const { write, rename } = mockPublication('{broken');
  expect(publish).toThrow(
    `Invalid build manifest: ${context.layout.manifestPath}`,
  );
  expect(rename).not.toHaveBeenCalled();
  expect(
    write.mock.calls.some(([file]) => file === context.layout.manifestPath),
  ).toBe(false);
});

test('manifest keeps other platforms and migrates legacy artifact keys atomically', () => {
  const legacy = { file: 'android/previous.apk' };
  const ios = { file: 'ios/previous.ipa' };
  const { write, rename } = mockPublication(
    JSON.stringify({
      artifacts: { android: legacy, ipa: ios },
      bundles: { ios: { version: 2 } },
    }),
  );
  const artifact = publish();
  expect(artifact).toMatchObject({ signed: false, publishable: false });
  const manifestWrite = write.mock.calls.find(
    ([file]) => file === `${context.layout.manifestPath}.tmp`,
  );
  expect(manifestWrite).toBeDefined();
  const manifest = JSON.parse(String(manifestWrite?.[1]));
  expect(manifest).toMatchObject({
    schemaVersion: 1,
    artifacts: { apk: legacy, ipa: ios, aab: artifact },
    bundles: { ios: { version: 2 }, android: { version: 1 } },
  });
  expect(manifest.artifacts.android).toBeUndefined();
  expect(rename).toHaveBeenCalledWith(
    `${context.layout.manifestPath}.tmp`,
    context.layout.manifestPath,
  );
  expect(write.mock.invocationCallOrder.at(-1)).toBeLessThan(
    rename.mock.invocationCallOrder[0],
  );
});

test('interrupted manifest replacement leaves the previous manifest untouched', () => {
  const { write, rename } = mockPublication('{}');
  rename.mockImplementation(() => {
    throw new Error('rename failed');
  });
  expect(publish).toThrow('rename failed');
  expect(
    write.mock.calls.some(([file]) => file === context.layout.manifestPath),
  ).toBe(false);
});

test('copies all required bundles and removes a stale optional public key', () => {
  jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
  jest
    .spyOn(fs, 'existsSync')
    .mockImplementation(file => !String(file).endsWith('public-key.pem'));
  const copy = jest
    .spyOn(fs, 'copyFileSync')
    .mockImplementation(() => undefined);
  const remove = jest.spyOn(fs, 'rmSync').mockImplementation(() => undefined);
  copyBundleArtifacts(context);
  expect(copy).toHaveBeenCalledTimes(REQUIRED_BUNDLE_FILES.length);
  expect(remove).toHaveBeenCalledWith(
    path.join(context.layout.platformDirectory, 'bundles', 'public-key.pem'),
    { force: true },
  );
});

test('missing required bundle fails instead of silently publishing', () => {
  jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
  jest.spyOn(fs, 'existsSync').mockReturnValue(false);
  expect(() => copyBundleArtifacts(context)).toThrow(
    'Missing split bundle artifact:',
  );
});
