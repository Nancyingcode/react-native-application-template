import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../brand-utils';
import type { PackageContext } from './types';
export const REQUIRED_BUNDLE_FILES = [
  'base.bundle',
  'business.bundle',
  'base.bundle.map',
  'business.bundle.map',
  'combined.bundle.map',
  'module-map.json',
  'bundle-manifest.json',
] as const;
export const OPTIONAL_BUNDLE_FILES = ['public-key.pem'] as const;
export function copyBundleArtifacts({ options, layout }: PackageContext): void {
  const destination = path.join(layout.platformDirectory, 'bundles');
  const source = path.join(ROOT, 'artifacts/bundles', options.platform);
  fs.mkdirSync(destination, { recursive: true });
  for (const name of REQUIRED_BUNDLE_FILES) {
    const file = path.join(source, name);
    if (!fs.existsSync(file))
      throw new Error(`Missing split bundle artifact: ${file}`);
    fs.copyFileSync(file, path.join(destination, name));
  }
  for (const name of OPTIONAL_BUNDLE_FILES) {
    const file = path.join(source, name);
    if (fs.existsSync(file))
      fs.copyFileSync(file, path.join(destination, name));
    else fs.rmSync(path.join(destination, name), { force: true });
  }
}
