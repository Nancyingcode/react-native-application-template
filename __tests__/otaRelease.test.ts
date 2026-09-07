import { generateKeyPairSync, verify } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRelease, validateCompatibility } from '../scripts/ota-release';
import type { BundleManifest } from '../src/core/ota/types';
const {
  createModuleIdFactory,
  serialize,
  sha256,
} = require('../scripts/split-bundle');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

let directory: string;
const business = Buffer.from('globalThis.business = true;');
const base = 'globalThis.runtime = true;';
const baseline: BundleManifest = {
  schemaVersion: 1,
  platform: 'android',
  brandId: 'aurora',
  environment: 'production',
  channel: 'direct',
  appVersion: '1.0.0',
  buildNumber: 42,
  baseVersion: sha256(base),
  nativeFingerprint: 'native',
  assetsFingerprint: 'assets',
  runtimeVersion: sha256('runtime'),
  bundleVersion: 0,
  businessSha256: sha256(business),
  businessBytes: business.length,
};

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-test-'));
  fs.writeFileSync(
    path.join(directory, 'bundle-manifest.json'),
    JSON.stringify(baseline),
  );
  fs.writeFileSync(path.join(directory, 'public-key.pem'), publicKey);
  fs.writeFileSync(path.join(directory, 'base.bundle'), base);
  fs.writeFileSync(path.join(directory, 'business.bundle'), business);
  for (const name of [
    'business.bundle.map',
    'combined.bundle.map',
    'module-map.json',
  ])
    fs.writeFileSync(path.join(directory, name), '{}');
});
afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

test.each([
  'brandId',
  'environment',
  'platform',
  'channel',
  'baseVersion',
  'runtimeVersion',
  'nativeFingerprint',
  'assetsFingerprint',
  'appVersion',
  'buildNumber',
  'schemaVersion',
] as const)('rejects incompatible %s', key => {
  expect(() =>
    validateCompatibility(baseline, { ...baseline, [key]: 'changed' }),
  ).toThrow(key);
});

test('signed releases are immutable, monotonic, and bind metadata and bundle hash', () => {
  const output = path.join(directory, 'releases');
  createRelease(
    directory,
    directory,
    output,
    3,
    'https://cdn.example/3/business.bundle',
    privateKey,
  );
  const envelope = JSON.parse(
    fs.readFileSync(
      path.join(output, baseline.runtimeVersion, '3/release.json'),
      'utf8',
    ),
  );
  const payload = Buffer.from(envelope.payload, 'base64');
  const signature = Buffer.from(envelope.signature, 'base64');
  expect(verify('RSA-SHA256', payload, publicKey, signature)).toBe(true);
  expect(JSON.parse(payload.toString())).toMatchObject({
    bundleVersion: 3,
    businessSha256: sha256(business),
  });
  payload[0] = (payload[0] + 1) % 256;
  expect(verify('RSA-SHA256', payload, publicKey, signature)).toBe(false);
  for (const version of [2, 3])
    expect(() =>
      createRelease(
        directory,
        directory,
        output,
        version,
        'https://cdn.example/business.bundle',
        privateKey,
      ),
    ).toThrow('greater than 3');
});

test('rejects tampered bundles and mismatched signing keys', () => {
  fs.writeFileSync(path.join(directory, 'business.bundle'), 'tampered');
  expect(() =>
    createRelease(
      directory,
      directory,
      directory,
      1,
      'https://cdn.example/bundle',
      privateKey,
    ),
  ).toThrow('checksum');
  fs.writeFileSync(path.join(directory, 'business.bundle'), business);
  const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString();
  expect(() =>
    createRelease(
      directory,
      directory,
      directory,
      1,
      'https://cdn.example/bundle',
      wrongKey,
    ),
  ).toThrow('does not match');
});

test.each([0, -1, 1.5, NaN, 2100000001])(
  'rejects invalid version %s',
  version => {
    expect(() =>
      createRelease(
        directory,
        directory,
        directory,
        version,
        'https://cdn.example/bundle',
        privateKey,
      ),
    ).toThrow('version');
  },
);

test.each([
  'http://cdn.example/bundle',
  'https://user:secret@cdn.example/bundle',
  'https://cdn.example/bundle#fragment',
])('rejects unsafe URL %s', url => {
  expect(() =>
    createRelease(directory, directory, directory, 1, url, privateKey),
  ).toThrow('HTTPS');
});

test('module IDs do not depend on traversal order or newly inserted business modules', () => {
  const root = path.resolve(__dirname, '..');
  const first = createModuleIdFactory();
  const second = createModuleIdFactory();
  const entry = path.join(root, 'App.tsx');
  const vendor = path.join(root, 'node_modules/react/index.js');
  const original = [first(entry), first(vendor)];
  second(path.join(root, 'src/new-business.ts'));
  expect([second(entry), second(vendor)]).toEqual(original);
  expect(new Set(original).size).toBe(2);
  expect(() => first(path.resolve(root, '../outside.js'))).toThrow('outside');
});

test('base defines the runtime once and business resolves vendor dependencies in that runtime', () => {
  const root = path.resolve(__dirname, '..');
  const module = (file: string, code: string, type = 'js/module') => ({
    path: path.join(root, file),
    dependencies: new Map(),
    getSource: () => Buffer.from(code),
    output: [{ type, data: { code, lineCount: 1, map: [] } }],
  });
  const vendor = module(
    'node_modules/fixture/vendor.js',
    '__d(function(g,r,i,a,m){m.exports=40;});',
  );
  const entry = module(
    'fixture-business.js',
    '__d(function(g,r,i,a,m,e,d){globalThis.answer=r(d[0])+2;});',
  );
  entry.dependencies.set('vendor', {
    absolutePath: vendor.path,
    data: { data: { asyncType: null } },
  });
  vendor.dependencies.set('optional', { data: { data: { isOptional: true } } });
  const pre = module(
    'fixture-runtime.js',
    'globalThis.boots=(globalThis.boots||0)+1;var table=new Map();function __d(f,id,d){table.set(id,[f,d]);}function __r(id){var [f,d]=table.get(id),m={exports:{}};f(globalThis,__r,null,null,m,m.exports,d);return m.exports;}',
    'js/script',
  );
  const previousOutput = process.env.SPLIT_BUNDLE_OUTPUT;
  process.env.SPLIT_BUNDLE_OUTPUT = directory;
  try {
    serialize(
      entry.path,
      [pre],
      {
        dependencies: new Map([
          [entry.path, entry],
          [vendor.path, vendor],
        ]),
        transformOptions: { platform: 'android' },
      },
      {
        createModuleId: createModuleIdFactory(),
        processModuleFilter: () => true,
        dev: false,
        runModule: true,
        runBeforeMainModule: [],
        getRunModuleStatement: (id: number) => `__r(${id});`,
        projectRoot: root,
        serverRoot: root,
        shouldAddToIgnoreList: () => false,
      },
    );
    const context = vm.createContext({});
    vm.runInContext(
      fs.readFileSync(path.join(directory, 'base.bundle'), 'utf8'),
      context,
    );
    expect(context.answer).toBeUndefined();
    vm.runInContext(
      fs.readFileSync(path.join(directory, 'business.bundle'), 'utf8'),
      context,
    );
    expect(context.answer).toBe(42);
    expect(context.boots).toBe(1);
    vendor.dependencies.set('business', { absolutePath: entry.path });
    expect(() =>
      serialize(
        entry.path,
        [pre],
        {
          dependencies: new Map([
            [entry.path, entry],
            [vendor.path, vendor],
          ]),
          transformOptions: { platform: 'android' },
        },
        {
          createModuleId: createModuleIdFactory(),
          processModuleFilter: () => true,
          dev: false,
          runModule: false,
          runBeforeMainModule: [],
          projectRoot: root,
        },
      ),
    ).toThrow('Base depends on business');
  } finally {
    if (previousOutput === undefined) delete process.env.SPLIT_BUNDLE_OUTPUT;
    else process.env.SPLIT_BUNDLE_OUTPUT = previousOutput;
  }
});
