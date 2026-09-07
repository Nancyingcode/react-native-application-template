const { createHash } = require('node:crypto');
const { Buffer } = require('node:buffer');
const fs = require('node:fs');
const path = require('node:path');
// Metro has no public serializer composition API. Keep this adapter covered by
// bundle integration tests and revisit it when upgrading the locked Metro version.
const baseJSBundle =
  require('metro/private/DeltaBundler/Serializers/baseJSBundle').default;
const bundleToString = require('metro/private/lib/bundleToString').default;
const {
  sourceMapString,
} = require('metro/private/DeltaBundler/Serializers/sourceMapString');

const root = path.resolve(__dirname, '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const modulePath = file => path.relative(root, file).replaceAll('\\', '/');

function createModuleIdFactory() {
  const ids = new Map();
  return file => {
    const name = modulePath(file);
    if (name.startsWith('../'))
      throw new Error(`Module outside project: ${name}`);
    const id = Number.parseInt(sha256(name).slice(0, 12), 16);
    if (ids.has(id) && ids.get(id) !== name)
      throw new Error('Module ID collision');
    ids.set(id, name);
    return id;
  };
}

function nativeFingerprint(platform) {
  const entries = [];
  const visit = directory => {
    for (const entry of fs.readdirSync(path.join(root, directory), {
      withFileTypes: true,
    })) {
      const name = `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (
          ![
            'build',
            'Pods',
            '.gradle',
            '.cxx',
            '.kotlin',
            'xcuserdata',
            'WhiteLabelApp.xcworkspace',
          ].includes(entry.name)
        )
          visit(name);
      } else if (
        !['local.properties', '.xcode.env.local', '.DS_Store'].includes(
          entry.name,
        )
      ) {
        entries.push([name, sha256(fs.readFileSync(path.join(root, name)))]);
      }
    }
  };
  visit(platform);
  for (const name of [
    'package-lock.json',
    'react-native.config.js',
    'generated/native/brand-manifest.json',
  ]) {
    entries.push([name, sha256(fs.readFileSync(path.join(root, name)))]);
  }
  return sha256(
    JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b, 'en'))),
  );
}

function serialize(entryPoint, preModules, graph, options) {
  if (options.dev) throw new Error('Split bundles require --dev false');
  const directory = process.env.SPLIT_BUNDLE_OUTPUT;
  if (!directory) throw new Error('SPLIT_BUNDLE_OUTPUT is required');
  const bundle = baseJSBundle(entryPoint, preModules, graph, {
    ...options,
    sourceMapUrl: undefined,
    sourceUrl: undefined,
  });
  const modules = [...graph.dependencies.values()].sort(
    (a, b) => options.createModuleId(a.path) - options.createModuleId(b.path),
  );
  const baseModules = modules.filter(module =>
    modulePath(module.path).startsWith('node_modules/'),
  );
  const baseIds = new Set(
    baseModules.map(module => options.createModuleId(module.path)),
  );
  // A base module must never require a business module, even through a dependency's custom resolver.
  for (const module of baseModules) {
    for (const dependency of module.dependencies.values()) {
      // Metro retains unresolved optional dependencies as slots without a path.
      if (!dependency.absolutePath) continue;
      if (!baseIds.has(options.createModuleId(dependency.absolutePath)))
        throw new Error(`Base depends on business: ${module.path}`);
    }
  }
  const businessModules = modules.filter(
    module => !baseIds.has(options.createModuleId(module.path)),
  );
  const base = bundleToString({
    pre: bundle.pre,
    modules: bundle.modules.filter(([id]) => baseIds.has(id)),
    post: '',
  }).code;
  const business = bundleToString({
    pre: '',
    modules: bundle.modules.filter(([id]) => !baseIds.has(id)),
    post: bundle.post,
  }).code;
  const brand = JSON.parse(
    fs.readFileSync(
      path.join(root, 'generated/native/brand-manifest.json'),
      'utf8',
    ),
  );
  const platform = graph.transformOptions.platform;
  const assets = modules.filter(module =>
    module.output.some(output => output.type === 'js/module/asset'),
  );
  const manifest = {
    schemaVersion: 1,
    platform,
    brandId: brand.brandId,
    environment: brand.environment,
    channel: brand.channel.id,
    appVersion: brand.versionName,
    buildNumber: brand.buildNumber,
    baseVersion: sha256(base),
    nativeFingerprint: nativeFingerprint(platform),
    assetsFingerprint: sha256(
      JSON.stringify(
        assets.map(module => [modulePath(module.path), module.output]),
      ),
    ),
    bundleVersion: 0,
    businessSha256: sha256(business),
    businessBytes: Buffer.byteLength(business),
  };
  manifest.runtimeVersion = sha256(
    JSON.stringify({
      ...manifest,
      businessSha256: undefined,
      businessBytes: undefined,
    }),
  );
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, contents] of Object.entries({
    'base.bundle': base,
    'business.bundle': business,
    'base.bundle.map': sourceMapString(
      [...preModules, ...baseModules],
      options,
    ),
    'business.bundle.map': sourceMapString(businessModules, options),
    'combined.bundle.map': sourceMapString(
      [...preModules, ...baseModules, ...businessModules],
      options,
    ),
    'bundle-manifest.json': JSON.stringify(manifest, null, 2) + '\n',
    'module-map.json': JSON.stringify(
      modules.map(module => ({
        path: modulePath(module.path),
        id: options.createModuleId(module.path),
        bundle: baseIds.has(options.createModuleId(module.path))
          ? 'base'
          : 'business',
      })),
      null,
      2,
    ),
  }))
    fs.writeFileSync(path.join(directory, name), contents);
  // The native fallback is still compiled by the standard Hermes build task.
  return {
    code: base + '\n' + business,
    map: sourceMapString(
      [...preModules, ...baseModules, ...businessModules],
      options,
    ),
  };
}

module.exports = {
  createModuleIdFactory,
  serialize,
  sha256,
  nativeFingerprint,
};
