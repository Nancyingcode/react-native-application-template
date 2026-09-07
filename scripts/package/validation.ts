import fs from 'node:fs';
import path from 'node:path';
import type { BrandConfig } from '../../src/brand/types';
import { ROOT, validateBrand } from '../brand-utils';
import { runCommand } from './command';
import { IOS_CONFIG } from './config';
import type {
  PackageOptions,
  AndroidPackageOptions,
  IosPackageOptions,
} from './types';

export function validateBrandForPackage(
  options: PackageOptions,
  brand: BrandConfig,
): void {
  const errors = validateBrand(brand);
  if (errors.length) {
    throw new Error(`Invalid brand "${brand.id}":\n- ${errors.join('\n- ')}`);
  }
  if (brand.id !== options.brandId) {
    throw new Error(
      `Brand directory and config id differ: ${options.brandId} / ${brand.id}.`,
    );
  }
  if (
    options.environment === 'production' &&
    !options.unsigned &&
    (options.platform === 'android'
      ? brand.native.android.applicationId
      : brand.native.ios.bundleId
    ).startsWith('com.example.')
  ) {
    throw new Error(
      `Production ${options.platform} packages require a non-placeholder bundle identifier.`,
    );
  }
}

export function validateAndroidSigning(
  options: AndroidPackageOptions,
  brand: BrandConfig,
  env: NodeJS.ProcessEnv,
): void {
  if (options.unsigned) {
    return;
  }
  const keystorePath =
    env.BRAND_KEYSTORE_PATH || brand.native.android.keystorePath;
  const keyAlias = env.BRAND_KEY_ALIAS || brand.native.android.keyAlias;
  const missing: string[] = [];
  if (!keystorePath)
    missing.push('BRAND_KEYSTORE_PATH/native.android.keystorePath');
  if (!keyAlias) missing.push('BRAND_KEY_ALIAS/native.android.keyAlias');
  if (!env.BRAND_KEYSTORE_PASSWORD) missing.push('BRAND_KEYSTORE_PASSWORD');
  if (!env.BRAND_KEY_PASSWORD) missing.push('BRAND_KEY_PASSWORD');
  if (missing.length || !keystorePath) {
    throw new Error(
      `Signed Android package is missing: ${missing.join(', ')}. ` +
        'Use --unsigned only for a non-publishable verification package.',
    );
  }
  const keystoreFile = path.isAbsolute(keystorePath)
    ? keystorePath
    : path.resolve(ROOT, keystorePath);
  if (!fs.statSync(keystoreFile, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Android keystore is not a readable file: ${keystoreFile}`);
  }
}

export function validateIosReadiness(
  options: IosPackageOptions,
  brand: BrandConfig,
  env: NodeJS.ProcessEnv,
): void {
  if (process.platform !== 'darwin') {
    throw new Error('iOS IPA packaging requires macOS and Xcode.');
  }
  const teamId = env.IOS_DEVELOPMENT_TEAM || brand.native.ios.teamId;
  if (!teamId || teamId === 'YOUR_TEAM_ID') {
    throw new Error(
      'iOS packaging requires IOS_DEVELOPMENT_TEAM or native.ios.teamId.',
    );
  }
  if (options.iosExportOptions && !fs.existsSync(options.iosExportOptions)) {
    throw new Error(
      `iOS export options not found: ${options.iosExportOptions}`,
    );
  }
  const privacyManifest = path.join(
    ROOT,
    'ios',
    IOS_CONFIG.scheme,
    'PrivacyInfo.xcprivacy',
  );
  const xcodeProject = path.join(
    ROOT,
    'ios',
    IOS_CONFIG.project,
    'project.pbxproj',
  );
  if (!fs.statSync(privacyManifest, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`iOS privacy manifest not found: ${privacyManifest}`);
  }
  if (
    !fs
      .readFileSync(xcodeProject, 'utf8')
      .includes('PrivacyInfo.xcprivacy in Resources')
  ) {
    throw new Error(
      'PrivacyInfo.xcprivacy must be included in the iOS Resources build phase.',
    );
  }
  runCommand('plutil', ['-lint', privacyManifest], { env });
  if (options.environment === 'production') {
    const iconDirectory = path.join(
      ROOT,
      'ios',
      IOS_CONFIG.scheme,
      'Images.xcassets',
      'AppIcon.appiconset',
    );
    const contents = JSON.parse(
      fs.readFileSync(path.join(iconDirectory, 'Contents.json'), 'utf8'),
    ) as { images?: Array<{ filename?: string }> };
    if (
      !contents.images?.length ||
      contents.images.some(
        image =>
          !image.filename ||
          !fs.existsSync(path.join(iconDirectory, image.filename)),
      )
    ) {
      throw new Error(
        'Production iOS packaging requires complete AppIcon assets.',
      );
    }
  }
  const apiKeyParts = [
    env.APP_STORE_CONNECT_API_KEY_PATH,
    env.APP_STORE_CONNECT_API_KEY_ID,
    env.APP_STORE_CONNECT_API_ISSUER_ID,
  ];
  if (apiKeyParts.some(Boolean) && !apiKeyParts.every(Boolean)) {
    throw new Error(
      'App Store Connect API key path, key id and issuer id must be provided together.',
    );
  }
  if (
    env.APP_STORE_CONNECT_API_KEY_PATH &&
    !fs
      .statSync(path.resolve(ROOT, env.APP_STORE_CONNECT_API_KEY_PATH), {
        throwIfNoEntry: false,
      })
      ?.isFile()
  ) {
    throw new Error(
      `App Store Connect API key is not a readable file: ${env.APP_STORE_CONNECT_API_KEY_PATH}`,
    );
  }
}
