import { createPublicKey, sign, verify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { BundleManifest } from '../src/core/ota/types';
import { ROOT } from './brand-utils';
import { generateBrand } from './generate-brand';
import type { BrandEnvironmentName } from '../src/brand/types';
const { sha256 } = require('./split-bundle') as {
  sha256(value: Buffer | string): string;
};

export function validateCompatibility(
  baseline: BundleManifest,
  candidate: BundleManifest,
): void {
  for (const key of [
    'schemaVersion',
    'platform',
    'brandId',
    'environment',
    'channel',
    'appVersion',
    'buildNumber',
    'baseVersion',
    'nativeFingerprint',
    'assetsFingerprint',
    'runtimeVersion',
  ] as const) {
    if (baseline[key] !== candidate[key])
      throw new Error(
        `OTA incompatible: ${key} changed; build a new native package`,
      );
  }
}

export function createRelease(
  baselineDirectory: string,
  candidateDirectory: string,
  destination: string,
  version: number,
  url: string,
  privateKey: string,
  notes = '',
): BundleManifest {
  if (!Number.isSafeInteger(version) || version < 1 || version > 2100000000)
    throw new Error('OTA version must be an integer in 1..2100000000');
  const parsedUrl = new URL(url);
  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.hash
  )
    throw new Error(
      'Business URL must be HTTPS without credentials or fragment',
    );
  const readManifest = (directory: string): BundleManifest =>
    JSON.parse(
      fs.readFileSync(path.join(directory, 'bundle-manifest.json'), 'utf8'),
    );
  const baseline = readManifest(baselineDirectory);
  const candidate = readManifest(candidateDirectory);
  validateCompatibility(baseline, candidate);
  if (!/^[a-f0-9]{64}$/.test(candidate.runtimeVersion)) {
    throw new Error('Invalid runtimeVersion');
  }
  const business = fs.readFileSync(
    path.join(candidateDirectory, 'business.bundle'),
  );
  if (
    sha256(business) !== candidate.businessSha256 ||
    business.length !== candidate.businessBytes ||
    business.length === 0 ||
    business.length > 20 * 1024 * 1024
  )
    throw new Error('Invalid business bundle checksum or size');
  if (
    sha256(fs.readFileSync(path.join(baselineDirectory, 'base.bundle'))) !==
    baseline.baseVersion
  )
    throw new Error('Invalid baseline base bundle');
  const publicKey = fs.readFileSync(
    path.join(baselineDirectory, 'public-key.pem'),
    'utf8',
  );
  const signingPublicKey = createPublicKey(privateKey).export({
    format: 'pem',
    type: 'spki',
  });
  if (
    signingPublicKey !==
    createPublicKey(publicKey).export({ format: 'pem', type: 'spki' })
  )
    throw new Error('Signing key does not match the native package');
  const manifest: BundleManifest = {
    ...candidate,
    bundleVersion: version,
    businessUrl: url,
    createdAt: new Date().toISOString(),
    releaseNotes: notes,
  };
  const payload = Buffer.from(JSON.stringify(manifest));
  const signature = sign('RSA-SHA256', payload, privateKey);
  if (!verify('RSA-SHA256', payload, publicKey, signature))
    throw new Error('Signature verification failed');
  const envelope =
    JSON.stringify({
      payload: payload.toString('base64'),
      signature: signature.toString('base64'),
    }) + '\n';
  if (Buffer.byteLength(envelope) > 65536) {
    throw new Error('OTA release manifest exceeds 64 KiB');
  }
  // Each runtime gets an append-only local release history. CI must share this output
  // directory (or enforce the same monotonic version constraint in its artifact store).
  const runtimeDirectory = path.join(destination, manifest.runtimeVersion);
  fs.mkdirSync(runtimeDirectory, { recursive: true });
  const lock = path.join(runtimeDirectory, '.release.lock');
  const lockDescriptor = fs.openSync(lock, 'wx');
  try {
    const highest = Math.max(
      0,
      ...fs
        .readdirSync(runtimeDirectory)
        .filter(name => /^\d+$/.test(name))
        .map(Number),
    );
    if (version <= highest)
      throw new Error(`OTA version must be greater than ${highest}`);
    const directory = path.join(runtimeDirectory, String(version));
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'business.bundle'), business);
    for (const name of [
      'business.bundle.map',
      'combined.bundle.map',
      'module-map.json',
    ]) {
      fs.copyFileSync(
        path.join(candidateDirectory, name),
        path.join(directory, name),
      );
    }
    fs.writeFileSync(
      path.join(directory, 'bundle-manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );
    fs.writeFileSync(path.join(directory, 'release.json'), envelope);
    console.log(`OTA release: ${directory}`);
  } finally {
    fs.closeSync(lockDescriptor);
    fs.unlinkSync(lock);
  }
  return manifest;
}

function main(): void {
  const args = process.argv.slice(2);
  const values = new Map<string, string>();
  const allowed = [
    '--baseline',
    '--bundle-version',
    '--business-url',
    '--private-key',
    '--output',
    '--notes',
  ];
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!allowed.includes(key) || !args[index + 1])
      throw new Error(`Invalid option ${key}; expected ${allowed.join(', ')}`);
    values.set(key, args[index + 1]);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (!value) throw new Error(`${key} is required`);
    return value;
  };
  const baselineDirectory = path.resolve(required('--baseline'));
  const baseline: BundleManifest = JSON.parse(
    fs.readFileSync(
      path.join(baselineDirectory, 'bundle-manifest.json'),
      'utf8',
    ),
  );
  const privateKey = fs.readFileSync(required('--private-key'), 'utf8');
  const url = required('--business-url');
  const version = Number(required('--bundle-version'));
  generateBrand({
    brandId: baseline.brandId,
    environment: baseline.environment as BrandEnvironmentName,
    versionName: baseline.appVersion,
    buildNumber: baseline.buildNumber,
  });
  const candidateDirectory = path.join(
    ROOT,
    'artifacts/bundles',
    baseline.platform,
  );
  if (candidateDirectory === baselineDirectory)
    throw new Error(
      'Copy the native baseline to an immutable directory before creating OTA releases',
    );
  for (const script of ['typecheck', 'lint', 'test']) {
    const npm = process.env.npm_execpath;
    if (!npm) throw new Error('Run this command via npm run ota:release');
    const result = spawnSync(process.execPath, [npm, 'run', script], {
      cwd: ROOT,
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.status !== 0) throw new Error(`${script} failed`);
  }
  const result = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'scripts/bundle-cli.js'),
      'bundle',
      '--platform',
      baseline.platform,
      '--dev',
      'false',
      '--entry-file',
      'index.js',
      '--bundle-output',
      path.join(candidateDirectory, 'index.bundle'),
      '--assets-dest',
      path.join(candidateDirectory, 'assets'),
      '--max-workers',
      '2',
    ],
    {
      cwd: ROOT,
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        OTA_PUBLIC_KEY_FILE: path.join(baselineDirectory, 'public-key.pem'),
      },
    },
  );
  if (result.status !== 0) throw new Error('OTA bundle build failed');
  createRelease(
    baselineDirectory,
    candidateDirectory,
    path.resolve(values.get('--output') || 'artifacts/ota'),
    version,
    url,
    privateKey,
    values.get('--notes'),
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
