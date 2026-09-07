import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../brand-utils';
import type { BasePackageOptions, CliResult, PackageOptions } from './types';

const ENVIRONMENTS = ['development', 'staging', 'production'];
const PLATFORMS = ['android', 'ios'];
const FORMATS = ['aab', 'apk', 'ipa'];

function packageVersion(): string {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  ) as { version: string };
  return manifest.version;
}

function optionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

interface ParsedArgs {
  brandId: string;
  platform: string;
  format: string;
  environment: string;
  versionName: string;
  buildNumber: string;
  outputDirectory: string;
  unsigned: boolean;
  skipChecks: boolean;
  clean: boolean;
  skipPods: boolean;
  allowProvisioningUpdates: boolean;
  iosExportMethod: string;
  iosExportOptions?: string;
  help: boolean;
}

function parseArgs(args: string[]): Partial<ParsedArgs> {
  const parsed: Partial<ParsedArgs> = {};
  let positionalBrandSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const equalsIndex = argument.indexOf('=');
    const name = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    const inlineValue =
      equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : undefined;
    const readValue = (): string => {
      if (inlineValue !== undefined) {
        if (!inlineValue) {
          throw new Error(`${name} requires a value`);
        }
        return inlineValue;
      }
      const value = optionValue(args, index, name);
      index += 1;
      return value;
    };
    const readFlag = (): void => {
      if (inlineValue !== undefined) {
        throw new Error(`${name} does not accept a value`);
      }
    };

    switch (name) {
      case '--brand':
        parsed.brandId = readValue();
        break;
      case '--platform':
        parsed.platform = readValue();
        break;
      case '--format':
      case '--android-format':
        parsed.format = readValue();
        break;
      case '--environment':
      case '--env':
        parsed.environment = readValue();
        break;
      case '--version':
      case '--version-name':
        parsed.versionName = readValue();
        break;
      case '--build-number':
        parsed.buildNumber = readValue();
        break;
      case '--output':
      case '--output-dir':
      case '--out-dir':
        parsed.outputDirectory = readValue();
        break;
      case '--ios-export-method':
        parsed.iosExportMethod = readValue();
        break;
      case '--ios-export-options':
        parsed.iosExportOptions = readValue();
        break;
      case '--unsigned':
        readFlag();
        parsed.unsigned = true;
        break;
      case '--skip-checks':
        readFlag();
        parsed.skipChecks = true;
        break;
      case '--clean':
        readFlag();
        parsed.clean = true;
        break;
      case '--skip-pods':
        readFlag();
        parsed.skipPods = true;
        break;
      case '--allow-provisioning-updates':
        readFlag();
        parsed.allowProvisioningUpdates = true;
        break;
      case '--help':
      case '-h':
        readFlag();
        parsed.help = true;
        break;
      default:
        if (argument.startsWith('-')) {
          throw new Error(`Unknown option: ${argument}`);
        }
        if (positionalBrandSeen) {
          throw new Error(`Unexpected argument: ${argument}`);
        }
        parsed.brandId = argument;
        positionalBrandSeen = true;
    }
  }

  return parsed;
}

function resolveOptions(
  parsed: Partial<ParsedArgs>,
  env: NodeJS.ProcessEnv,
): ParsedArgs {
  const resolved = {
    brandId: env.BRAND || 'aurora',
    platform: env.BUILD_PLATFORM || 'android',
    format: env.BUILD_FORMAT || '',
    environment: env.APP_ENV || 'production',
    versionName: env.APP_VERSION || packageVersion(),
    buildNumber: env.BUILD_NUMBER || env.GITHUB_RUN_NUMBER || '',
    outputDirectory: env.BUILD_OUTPUT || path.join(ROOT, 'artifacts'),
    unsigned: false,
    skipChecks: false,
    clean: false,
    skipPods: false,
    allowProvisioningUpdates: false,
    iosExportMethod: env.IOS_EXPORT_METHOD || 'app-store-connect',
    iosExportOptions: env.IOS_EXPORT_OPTIONS_PLIST,
    help: false,
    ...parsed,
  };
  return {
    ...resolved,
    format:
      resolved.format || (resolved.platform === 'android' ? 'aab' : 'ipa'),
  };
}

function validateOptions(resolved: ParsedArgs): PackageOptions {
  const {
    brandId,
    platform,
    format,
    environment,
    versionName,
    outputDirectory,
    unsigned,
    skipChecks,
    clean,
    skipPods,
    allowProvisioningUpdates,
    iosExportMethod,
    iosExportOptions,
  } = resolved;
  let buildNumber = resolved.buildNumber;
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(brandId)) {
    throw new Error(
      'Brand id may only contain lowercase letters, numbers, _ and -.',
    );
  }
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error(
      `Invalid platform "${platform}". Expected: ${PLATFORMS.join(', ')}`,
    );
  }
  const resolvedPlatform = platform;
  const resolvedFormat = format;
  if (
    resolvedFormat !== 'aab' &&
    resolvedFormat !== 'apk' &&
    resolvedFormat !== 'ipa'
  ) {
    throw new Error(
      `Invalid format "${resolvedFormat}". Expected: ${FORMATS.join(', ')}`,
    );
  }
  if (
    (resolvedPlatform === 'android' && resolvedFormat === 'ipa') ||
    (resolvedPlatform === 'ios' && resolvedFormat !== 'ipa')
  ) {
    throw new Error(
      `Format ${resolvedFormat} is not valid for ${resolvedPlatform}.`,
    );
  }
  if (
    environment !== 'development' &&
    environment !== 'staging' &&
    environment !== 'production'
  ) {
    throw new Error(
      `Invalid environment "${environment}". Expected: ${ENVIRONMENTS.join(
        ', ',
      )}`,
    );
  }
  if (!/^\d+(?:\.\d+){0,2}$/.test(versionName)) {
    throw new Error(
      'Version must contain one to three numeric components, such as 1.2.3.',
    );
  }
  if (!buildNumber) {
    if (environment === 'production' && !unsigned) {
      throw new Error(
        'A production package requires --build-number, BUILD_NUMBER or GITHUB_RUN_NUMBER.',
      );
    }
    buildNumber = '1';
  }
  if (
    !/^\d+$/.test(buildNumber) ||
    Number(buildNumber) < 1 ||
    Number(buildNumber) > 2100000000
  ) {
    throw new Error(
      'Build number must be an integer between 1 and 2100000000.',
    );
  }
  if (resolvedPlatform === 'ios' && unsigned) {
    throw new Error('The iOS packaging flow only exports signed IPA files.');
  }

  const common: BasePackageOptions = {
    brandId,
    environment,
    versionName,
    buildNumber: Number(buildNumber),
    outputDirectory: path.resolve(outputDirectory),
    skipChecks,
    clean,
    skipPods,
    allowProvisioningUpdates,
    iosExportMethod,
    iosExportOptions: iosExportOptions
      ? path.resolve(iosExportOptions)
      : undefined,
  };
  if (resolvedPlatform === 'android' && resolvedFormat !== 'ipa') {
    return {
      ...common,
      platform: resolvedPlatform,
      format: resolvedFormat,
      unsigned,
    };
  }
  if (resolvedPlatform === 'ios' && resolvedFormat === 'ipa' && !unsigned) {
    return {
      ...common,
      platform: resolvedPlatform,
      format: resolvedFormat,
      unsigned: false,
    };
  }
  throw new Error(
    `Format ${resolvedFormat} is not valid for ${resolvedPlatform}.`,
  );
}

export function parsePackageOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): CliResult {
  const parsed = parseArgs(args);
  if (parsed.help) return { help: true };
  return { help: false, options: validateOptions(resolveOptions(parsed, env)) };
}

export const HELP = `Usage:
  npm run package:android -- --brand aurora --build-number 42
  npm run package:android:apk -- --brand aurora --unsigned
  npm run package:ios -- --brand aurora --build-number 42

Options:
  --brand <id>                    Brand id (default: BRAND or aurora)
  --platform <android|ios>        Target platform
  --format <aab|apk|ipa>          Output format (default: aab / ipa)
  --environment <name>            development, staging or production
  --version <x.y.z>               Marketing version
  --build-number <number>         Android versionCode / iOS build number
  --output-dir <path>             Artifact root (default: artifacts)
  --unsigned                      Android-only, non-publishable verification package
  --skip-checks                   Skip validation, typecheck, lint and tests
  --clean                         Clean native build outputs first
  --skip-pods                     Do not run CocoaPods before iOS packaging
  --ios-export-options <path>     Existing ExportOptions.plist
  --ios-export-method <method>    Default: app-store-connect
  --allow-provisioning-updates    Allow Xcode to update signing assets
`;
