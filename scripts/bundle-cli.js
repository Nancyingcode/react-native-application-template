const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (args[0] !== 'bundle' || !args.includes('--bundle-output'))
  throw new Error('Expected bundle --bundle-output');
const root = path.resolve(__dirname, '..');
const platform = option('--platform');
const output = path.join(root, 'artifacts', 'bundles', platform);
// Force identical source transforms for native and OTA builds, regardless of Hermes defaults.
const forwarded = args.filter(
  (value, index) => value !== '--minify' && args[index - 1] !== '--minify',
);
const cli =
  args.includes('--config-cmd') || args.includes('--load-config')
    ? 'scripts/bundle.js'
    : 'cli.js';
const result = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/react-native', cli),
    ...forwarded,
    '--minify',
    'true',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, SPLIT_BUNDLE_OUTPUT: output },
  },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

const publicKey = process.env.OTA_PUBLIC_KEY_FILE
  ? fs.readFileSync(process.env.OTA_PUBLIC_KEY_FILE, 'utf8')
  : '';
if (publicKey) {
  const key = require('node:crypto').createPublicKey(publicKey);
  if (
    key.asymmetricKeyType !== 'rsa' ||
    key.asymmetricKeyDetails.modulusLength < 2048
  )
    throw new Error('OTA requires an RSA public key of at least 2048 bits');
  // PKCS#1 DER is accepted by both Android and Apple's Security framework.
  fs.writeFileSync(
    path.join(output, 'public-key.der'),
    key.export({ type: 'pkcs1', format: 'der' }),
  );
  fs.writeFileSync(
    path.join(output, 'public-key.pem'),
    key.export({ type: 'spki', format: 'pem' }),
  );
} else {
  for (const name of ['public-key.der', 'public-key.pem']) {
    fs.rmSync(path.join(output, name), { force: true });
  }
}
const nativeOutput =
  platform === 'ios'
    ? option('--assets-dest')
    : path.dirname(path.resolve(option('--bundle-output')));
const destination = path.join(nativeOutput, 'ota');
fs.mkdirSync(destination, { recursive: true });
for (const name of [
  'base.bundle',
  'business.bundle',
  'bundle-manifest.json',
  'public-key.der',
  'public-key.pem',
]) {
  const file = path.join(output, name);
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(destination, name));
  else fs.rmSync(path.join(destination, name), { force: true });
}
