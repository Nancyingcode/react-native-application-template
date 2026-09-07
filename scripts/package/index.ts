import { readBrand } from '../brand-utils';
import { generateBrand } from '../generate-brand';
import { HELP, parsePackageOptions } from './cli';
import { gitSource, publishArtifact, resolveArtifactLayout } from './artifact';
import { packageAndroid } from './android';
import { packageIos } from './ios';
import { copyBundleArtifacts } from './bundles';
import { runNpmScript } from './command';
import {
  validateBrandForPackage,
  validateAndroidSigning,
  validateIosReadiness,
} from './validation';
import type { PackageContext, PackageOptions } from './types';

function preparePackage(
  options: PackageOptions,
  env: NodeJS.ProcessEnv,
): PackageContext {
  const sourceState = gitSource(env);
  const { config: brand } = readBrand(options.brandId);
  validateBrandForPackage(options, brand);
  if (options.platform === 'android')
    validateAndroidSigning(options, brand, env);
  else validateIosReadiness(options, brand, env);
  generateBrand({
    brandId: options.brandId,
    environment: options.environment,
    versionName: options.versionName,
    buildNumber: options.buildNumber,
  });
  return {
    options,
    brand,
    env,
    sourceState,
    layout: resolveArtifactLayout(options),
  };
}

function runQualityChecksIfNeeded({ options, env }: PackageContext): void {
  if (!options.skipChecks)
    for (const script of ['brand:validate', 'typecheck', 'lint', 'test'])
      runNpmScript(script, env);
}

export function main(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): void {
  const cli = parsePackageOptions(args, env);
  if (cli.help) {
    console.log(HELP);
    return;
  }
  const context = preparePackage(cli.options, env);
  runQualityChecksIfNeeded(context);
  const { options, brand, layout, sourceState } = context;
  const nativeArtifact =
    options.platform === 'android'
      ? packageAndroid(options, env)
      : packageIos(options, brand, layout, env);
  copyBundleArtifacts(context);
  const artifact = publishArtifact(
    nativeArtifact,
    options,
    brand,
    layout,
    sourceState,
  );
  console.log(`\nPackage complete: ${layout.artifactPath}`);
  console.log(`SHA-256: ${artifact.sha256}`);
  if (!artifact.publishable)
    console.log('This artifact is marked non-publishable.');
}
