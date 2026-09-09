const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(process.argv[2]);
const assets = path.join(root, 'fixture-assets/assets/ota');
fs.mkdirSync(assets, { recursive: true });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const base = Buffer.from('globalThis.baseLoaded=true;');
const business = Buffer.from('globalThis.businessLoaded=true;');
const baseline = { schemaVersion: 1, platform: 'android', brandId: 'p0', environment: 'test', channel: 'test', appVersion: '1.0.0', buildNumber: 1, baseVersion: hash(base), nativeFingerprint: 'native', assetsFingerprint: 'assets', runtimeVersion: 'p0-runtime', bundleVersion: 0, businessSha256: hash(business), businessBytes: business.length };
fs.writeFileSync(path.join(assets, 'base.bundle'), base);
fs.writeFileSync(path.join(assets, 'bundle-manifest.json'), JSON.stringify(baseline));
fs.writeFileSync(path.join(assets, 'public-key.pem'), keys.publicKey.export({type:'spki',format:'pem'}));
fs.writeFileSync(path.join(root, 'business.bundle'), business);
function release(name, changes = {}, tamper = false) {
  const payload = Buffer.from(JSON.stringify({...baseline,bundleVersion:1,businessUrl:'https://p0.test/business',...changes}));
  const signature = crypto.sign('RSA-SHA256',payload,keys.privateKey);
  if(tamper) signature[0] ^= 1;
  fs.writeFileSync(path.join(root,name+'.json'),JSON.stringify({payload:payload.toString('base64'),signature:signature.toString('base64')}));
}
release('valid'); release('v2',{bundleVersion:2}); release('v3',{bundleVersion:3});
release('bad-signature',{},true); release('wrong-brand',{brandId:'other'});
release('wrong-base',{baseVersion:'0'.repeat(64)}); release('wrong-platform',{platform:'ios'});
release('wrong-environment',{environment:'production'});
release('wrong-hash',{businessSha256:'0'.repeat(64)});
release('wrong-size',{businessBytes:business.length+1});
console.log('Generated ephemeral test signatures; private key was not persisted.');
