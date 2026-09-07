import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BrandConfig } from '../../src/brand/types';
import { ROOT } from '../brand-utils';
import { captureCommand } from './command';
import type {
  PackageOptions,
  ArtifactLayout,
  PublishedArtifact,
} from './types';

export function resolveArtifactLayout(options: PackageOptions): ArtifactLayout {
  const releaseDirectory = path.join(
    options.outputDirectory,
    options.brandId,
    options.environment,
    `${options.versionName}+${options.buildNumber}`,
  );
  const platformDirectory = path.join(releaseDirectory, options.platform);
  const releaseLabel = options.unsigned ? 'unsigned' : 'release';
  const artifactName =
    [
      options.brandId,
      options.environment,
      options.versionName,
      String(options.buildNumber),
      releaseLabel,
    ].join('-') + `.${options.format}`;
  return {
    releaseDirectory,
    platformDirectory,
    artifactName,
    artifactPath: path.join(platformDirectory, artifactName),
    checksumPath: path.join(platformDirectory, `${artifactName}.sha256`),
    manifestPath: path.join(releaseDirectory, 'build-manifest.json'),
  };
}

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function gitSource(env: NodeJS.ProcessEnv): {
  commit: string | null;
  dirty: boolean | null;
} {
  const commit = captureCommand('git', ['rev-parse', 'HEAD'], { env });
  const status = captureCommand('git', ['status', '--porcelain'], { env });
  return {
    commit: commit.status === 0 ? commit.output.trim() : null,
    dirty: status.status === 0 ? Boolean(status.output.trim()) : null,
  };
}

export function publishArtifact(
  source: string,
  options: PackageOptions,
  brand: BrandConfig,
  layout: ArtifactLayout,
  sourceState: ReturnType<typeof gitSource>,
): PublishedArtifact {
  const stat = fs.statSync(source);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`Native build produced an empty artifact: ${source}`);
  }
  fs.mkdirSync(layout.platformDirectory, { recursive: true });
  fs.copyFileSync(source, layout.artifactPath);
  const checksum = sha256(layout.artifactPath);
  fs.writeFileSync(
    layout.checksumPath,
    `${checksum}  ${layout.artifactName}\n`,
  );
  const artifact: PublishedArtifact = {
    file: path
      .relative(layout.releaseDirectory, layout.artifactPath)
      .replaceAll('\\', '/'),
    bytes: fs.statSync(layout.artifactPath).size,
    sha256: checksum,
    signed: !options.unsigned,
    publishable: !options.unsigned && options.environment === 'production',
  };
  let existingArtifacts: Record<string, PublishedArtifact> = {};
  let existingBundles: Record<string, unknown> = {};
  if (fs.existsSync(layout.manifestPath)) {
    try {
      const existing = JSON.parse(
        fs.readFileSync(layout.manifestPath, 'utf8'),
      ) as {
        artifacts?: Record<string, PublishedArtifact>;
        bundles?: Record<string, unknown>;
      };
      existingArtifacts = existing.artifacts || {};
      existingBundles = existing.bundles || {};
    } catch (error) {
      throw Object.assign(
        new Error(`Invalid build manifest: ${layout.manifestPath}`),
        { cause: error },
      );
    }
  }
  const legacyArtifact = existingArtifacts[options.platform];
  if (legacyArtifact) {
    const legacyFormat = path.extname(legacyArtifact.file).slice(1);
    if (
      legacyFormat === 'aab' ||
      legacyFormat === 'apk' ||
      legacyFormat === 'ipa'
    ) {
      existingArtifacts[legacyFormat] = legacyArtifact;
    }
    delete existingArtifacts[options.platform];
  }
  const manifest = {
    schemaVersion: 1,
    brandId: brand.id,
    environment: options.environment,
    versionName: options.versionName,
    buildNumber: options.buildNumber,
    applicationId: brand.native.android.applicationId,
    bundleId: brand.native.ios.bundleId,
    channel: brand.native.channel,
    modules: brand.assembly.modules,
    source: sourceState,
    bundles: {
      ...existingBundles,
      [options.platform]: {
        manifest: `${options.platform}/bundles/bundle-manifest.json`,
        ...JSON.parse(
          fs.readFileSync(
            path.join(
              ROOT,
              'artifacts/bundles',
              options.platform,
              'bundle-manifest.json',
            ),
            'utf8',
          ),
        ),
      },
    },
    createdAt: new Date().toISOString(),
    artifacts: {
      ...existingArtifacts,
      [options.format]: artifact,
    },
  };
  fs.writeFileSync(
    `${layout.manifestPath}.tmp`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  fs.renameSync(`${layout.manifestPath}.tmp`, layout.manifestPath);
  return artifact;
}
