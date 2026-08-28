import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { BrandConfig, BrandEnvironmentName } from '../src/brand/types';
import { androidEnvironment, findAndroidSdk } from './android-utils';
import { readBrand, ROOT, validateBrand } from './brand-utils';
import { generateBrand } from './generate-brand';

export type PackagePlatform = 'android' | 'ios';
export type PackageFormat = 'aab' | 'apk' | 'ipa';

export interface PackageOptions {
  brandId: string;
  platform: PackagePlatform;
  format: PackageFormat;
  environment: BrandEnvironmentName;
  versionName: string;
  buildNumber: number;
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

interface PackageManifest {
  version: string;
}

interface ArtifactLayout {
  releaseDirectory: string;
  platformDirectory: string;
  artifactName: string;
  artifactPath: string;
  checksumPath: string;
  manifestPath: string;
}

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

interface CommandResult {
  status: number;
  output: string;
}

interface PublishedArtifact {
  file: string;
  bytes: number;
  sha256: string;
  signed: boolean;
  publishable: boolean;
}

const ENVIRONMENTS: BrandEnvironmentName[] = [
  'development',
  'staging',
  'production',
];
const PLATFORMS: PackagePlatform[] = ['android', 'ios'];
const FORMATS: PackageFormat[] = ['aab', 'apk', 'ipa'];

function packageVersion(): string {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  ) as PackageManifest;
  return manifest.version;
}

function optionValue(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

export function parsePackageOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): PackageOptions {
  let brandId = env.BRAND || 'aurora';
  let platform = env.BUILD_PLATFORM || 'android';
  let format = env.BUILD_FORMAT || '';
  let environment = env.APP_ENV || 'production';
  let versionName = env.APP_VERSION || packageVersion();
  let buildNumber = env.BUILD_NUMBER || env.GITHUB_RUN_NUMBER || '';
  let outputDirectory = env.BUILD_OUTPUT || path.join(ROOT, 'artifacts');
  let unsigned = false;
  let skipChecks = false;
  let clean = false;
  let skipPods = false;
  let allowProvisioningUpdates = false;
  let iosExportMethod = env.IOS_EXPORT_METHOD || 'app-store-connect';
  let iosExportOptions = env.IOS_EXPORT_OPTIONS_PLIST;
  let help = false;
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
        brandId = readValue();
        break;
      case '--platform':
        platform = readValue();
        break;
      case '--format':
      case '--android-format':
        format = readValue();
        break;
      case '--environment':
      case '--env':
        environment = readValue();
        break;
      case '--version':
      case '--version-name':
        versionName = readValue();
        break;
      case '--build-number':
        buildNumber = readValue();
        break;
      case '--output':
      case '--output-dir':
      case '--out-dir':
        outputDirectory = readValue();
        break;
      case '--ios-export-method':
        iosExportMethod = readValue();
        break;
      case '--ios-export-options':
        iosExportOptions = readValue();
        break;
      case '--unsigned':
        readFlag();
        unsigned = true;
        break;
      case '--skip-checks':
        readFlag();
        skipChecks = true;
        break;
      case '--clean':
        readFlag();
        clean = true;
        break;
      case '--skip-pods':
        readFlag();
        skipPods = true;
        break;
      case '--allow-provisioning-updates':
        readFlag();
        allowProvisioningUpdates = true;
        break;
      case '--help':
      case '-h':
        readFlag();
        help = true;
        break;
      default:
        if (argument.startsWith('-')) {
          throw new Error(`Unknown option: ${argument}`);
        }
        if (positionalBrandSeen) {
          throw new Error(`Unexpected argument: ${argument}`);
        }
        brandId = argument;
        positionalBrandSeen = true;
    }
  }

  if (help) {
    return {
      brandId,
      platform: 'android',
      format: 'aab',
      environment: 'production',
      versionName,
      buildNumber: 1,
      outputDirectory: path.resolve(outputDirectory),
      unsigned,
      skipChecks,
      clean,
      skipPods,
      allowProvisioningUpdates,
      iosExportMethod,
      iosExportOptions,
      help,
    };
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(brandId)) {
    throw new Error(
      'Brand id may only contain lowercase letters, numbers, _ and -.',
    );
  }
  if (!PLATFORMS.includes(platform as PackagePlatform)) {
    throw new Error(
      `Invalid platform "${platform}". Expected: ${PLATFORMS.join(', ')}`,
    );
  }
  const resolvedPlatform = platform as PackagePlatform;
  const resolvedFormat = (format ||
    (resolvedPlatform === 'android' ? 'aab' : 'ipa')) as PackageFormat;
  if (!FORMATS.includes(resolvedFormat)) {
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
  if (!ENVIRONMENTS.includes(environment as BrandEnvironmentName)) {
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

  return {
    brandId,
    platform: resolvedPlatform,
    format: resolvedFormat,
    environment: environment as BrandEnvironmentName,
    versionName,
    buildNumber: Number(buildNumber),
    outputDirectory: path.resolve(outputDirectory),
    unsigned,
    skipChecks,
    clean,
    skipPods,
    allowProvisioningUpdates,
    iosExportMethod,
    iosExportOptions: iosExportOptions
      ? path.resolve(iosExportOptions)
      : undefined,
    help,
  };
}

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

function quoteForDisplay(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): void {
  console.log(`\n> ${[command, ...args].map(quoteForDisplay).join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed with exit code ${result.status ?? 'unknown'}.`,
    );
  }
}

function captureCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function runNpmScript(script: string): void {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    runCommand(process.execPath, [npmExecPath, 'run', script]);
    return;
  }
  runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script]);
}

function validateBrandForPackage(
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

function validateAndroidSigning(
  options: PackageOptions,
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
  if (missing.length) {
    throw new Error(
      `Signed Android package is missing: ${missing.join(', ')}. ` +
        'Use --unsigned only for a non-publishable verification package.',
    );
  }
  const keystoreFile = path.isAbsolute(keystorePath!)
    ? keystorePath!
    : path.resolve(ROOT, keystorePath!);
  if (!fs.statSync(keystoreFile, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Android keystore is not a readable file: ${keystoreFile}`);
  }
}

function validateIosReadiness(
  options: PackageOptions,
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
    'WhiteLabelApp',
    'PrivacyInfo.xcprivacy',
  );
  const xcodeProject = path.join(
    ROOT,
    'ios',
    'WhiteLabelApp.xcodeproj',
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
  runCommand('plutil', ['-lint', privacyManifest]);
  if (options.environment === 'production') {
    const iconDirectory = path.join(
      ROOT,
      'ios',
      'WhiteLabelApp',
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

function runQualityChecks(): void {
  for (const script of ['brand:validate', 'typecheck', 'lint', 'test']) {
    runNpmScript(script);
  }
}

function findAndroidArtifact(format: PackageFormat): string {
  const directory = path.join(
    ROOT,
    'android',
    'app',
    'build',
    'outputs',
    format === 'aab' ? 'bundle' : 'apk',
    'release',
  );
  if (!fs.existsSync(directory)) {
    throw new Error(`Android output directory was not created: ${directory}`);
  }
  const candidates = fs
    .readdirSync(directory)
    .filter(file => file.endsWith(`.${format}`))
    .map(file => path.join(directory, file))
    .filter(file => fs.statSync(file).isFile())
    .sort(
      (left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs,
    );
  if (!candidates.length) {
    throw new Error(
      `Gradle completed without producing a ${format.toUpperCase()} file.`,
    );
  }
  return candidates[0];
}

function findJavaExecutable(): string {
  return process.env.JAVA_HOME
    ? path.join(
        process.env.JAVA_HOME,
        'bin',
        process.platform === 'win32' ? 'java.exe' : 'java',
      )
    : 'java';
}

function findApkSignerJar(sdk: string): string {
  const buildTools = path.join(sdk, 'build-tools');
  const versions = fs.existsSync(buildTools)
    ? fs
        .readdirSync(buildTools)
        .sort((left, right) =>
          right.localeCompare(left, undefined, { numeric: true }),
        )
    : [];
  const signer = versions
    .map(version => path.join(buildTools, version, 'lib', 'apksigner.jar'))
    .find(candidate => fs.existsSync(candidate));
  if (!signer) {
    throw new Error(
      'apksigner.jar was not found in the Android SDK build-tools.',
    );
  }
  return signer;
}

function verifyAndroidArtifact(
  artifact: string,
  format: PackageFormat,
  signed: boolean,
  sdk: string,
): void {
  const result =
    format === 'apk'
      ? captureCommand(findJavaExecutable(), [
          '-jar',
          findApkSignerJar(sdk),
          'verify',
          '--verbose',
          artifact,
        ])
      : captureCommand('jarsigner', [
          '-J-Duser.language=en',
          '-J-Duser.country=US',
          '-verify',
          '-certs',
          artifact,
        ]);
  const verified =
    format === 'apk'
      ? result.status === 0
      : result.status === 0 &&
        /jar verified/i.test(result.output) &&
        !/jar is unsigned/i.test(result.output);
  if (verified !== signed) {
    throw new Error(
      signed
        ? `Android ${format.toUpperCase()} signature verification failed.`
        : `Expected an unsigned ${format.toUpperCase()}, but a signature was detected.`,
    );
  }
}

function packageAndroid(options: PackageOptions): {
  artifact: string;
  sdk: string;
} {
  const sdk = findAndroidSdk();
  if (!sdk) {
    throw new Error(
      'Android SDK not found. Set ANDROID_HOME or install Android Studio.',
    );
  }
  const java = findJavaExecutable();
  const wrapperJar = path.join(
    ROOT,
    'android',
    'gradle',
    'wrapper',
    'gradle-wrapper.jar',
  );
  const task =
    options.format === 'aab' ? ':app:bundleRelease' : ':app:assembleRelease';
  const args = [
    ...(options.clean ? ['clean'] : []),
    task,
    '--no-daemon',
    `-PversionName=${options.versionName}`,
    `-PversionCode=${options.buildNumber}`,
    `-PreleaseSigningMode=${options.unsigned ? 'unsigned' : 'signed'}`,
    `-PreactNativeArchitectures=${
      process.env.ANDROID_ARCHITECTURES || 'armeabi-v7a,arm64-v8a'
    }`,
  ];
  runCommand(
    java,
    [
      '-Dorg.gradle.appname=gradlew',
      '-classpath',
      wrapperJar,
      'org.gradle.wrapper.GradleWrapperMain',
      ...args,
    ],
    {
      cwd: path.join(ROOT, 'android'),
      env: androidEnvironment(sdk),
    },
  );
  const artifact = findAndroidArtifact(options.format);
  verifyAndroidArtifact(artifact, options.format, !options.unsigned, sdk);
  return { artifact, sdk };
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function createIosExportOptions(
  method: string,
  teamId: string,
  bundleId: string,
  provisioningProfile?: string,
): string {
  const manual = Boolean(provisioningProfile);
  const profiles = manual
    ? `\n\t<key>provisioningProfiles</key>\n\t<dict>\n\t\t<key>${xml(
        bundleId,
      )}</key>\n\t\t<string>${xml(provisioningProfile!)}</string>\n\t</dict>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>method</key>
\t<string>${xml(method)}</string>
\t<key>destination</key>
\t<string>export</string>
\t<key>signingStyle</key>
\t<string>${manual ? 'manual' : 'automatic'}</string>
\t<key>teamID</key>
\t<string>${xml(teamId)}</string>
\t<key>manageAppVersionAndBuildNumber</key>
\t<false/>
\t<key>stripSwiftSymbols</key>
\t<true/>
\t<key>uploadSymbols</key>
\t<true/>${profiles}
</dict>
</plist>
`;
}

function packageIos(
  options: PackageOptions,
  brand: BrandConfig,
  layout: ArtifactLayout,
): string {
  if (!options.skipPods) {
    runCommand('bundle', ['check']);
    runCommand('bundle', ['exec', 'pod', 'install', '--project-directory=ios']);
  }
  const workspace = path.join(ROOT, 'ios', 'WhiteLabelApp.xcworkspace');
  if (!fs.existsSync(workspace)) {
    throw new Error(`CocoaPods workspace not found: ${workspace}`);
  }
  fs.mkdirSync(layout.platformDirectory, { recursive: true });
  const teamId = process.env.IOS_DEVELOPMENT_TEAM || brand.native.ios.teamId!;
  const profile =
    process.env.IOS_PROVISIONING_PROFILE ||
    brand.native.ios.provisioningProfile;
  const archivePath = path.join(
    layout.platformDirectory,
    'WhiteLabelApp.xcarchive',
  );
  const derivedData = path.join(layout.platformDirectory, 'DerivedData');
  const exportDirectory = path.join(layout.platformDirectory, 'export');
  const exportOptions =
    options.iosExportOptions ||
    path.join(layout.platformDirectory, 'ExportOptions.generated.plist');
  if (!options.iosExportOptions) {
    fs.writeFileSync(
      exportOptions,
      createIosExportOptions(
        options.iosExportMethod,
        teamId,
        brand.native.ios.bundleId,
        profile,
      ),
    );
  }
  const authenticationArgs: string[] = [];
  if (process.env.APP_STORE_CONNECT_API_KEY_PATH) {
    authenticationArgs.push(
      '-authenticationKeyPath',
      process.env.APP_STORE_CONNECT_API_KEY_PATH,
      '-authenticationKeyID',
      process.env.APP_STORE_CONNECT_API_KEY_ID!,
      '-authenticationKeyIssuerID',
      process.env.APP_STORE_CONNECT_API_ISSUER_ID!,
    );
  }
  const archiveArgs = [
    '-workspace',
    workspace,
    '-scheme',
    'WhiteLabelApp',
    '-configuration',
    'Release',
    '-sdk',
    'iphoneos',
    '-destination',
    'generic/platform=iOS',
    '-derivedDataPath',
    derivedData,
    '-archivePath',
    archivePath,
    `PRODUCT_BUNDLE_IDENTIFIER=${brand.native.ios.bundleId}`,
    `MARKETING_VERSION=${options.versionName}`,
    `CURRENT_PROJECT_VERSION=${options.buildNumber}`,
    'IPHONEOS_DEPLOYMENT_TARGET=15.5',
    `DEVELOPMENT_TEAM=${teamId}`,
    `CODE_SIGN_STYLE=${profile ? 'Manual' : 'Automatic'}`,
    `PROVISIONING_PROFILE_SPECIFIER=${profile || ''}`,
    ...(profile
      ? [
          `CODE_SIGN_IDENTITY=${
            ['debugging', 'development'].includes(options.iosExportMethod)
              ? 'Apple Development'
              : 'Apple Distribution'
          }`,
        ]
      : []),
    ...authenticationArgs,
    ...(options.allowProvisioningUpdates ? ['-allowProvisioningUpdates'] : []),
    'archive',
  ];
  if (options.clean) {
    runCommand('xcodebuild', archiveArgs.slice(0, -1).concat('clean'));
  }
  runCommand('xcodebuild', archiveArgs);
  const appDirectory = path.join(
    archivePath,
    'Products',
    'Applications',
    'WhiteLabelApp.app',
  );
  if (!fs.existsSync(appDirectory)) {
    throw new Error('Xcode archive completed without an application bundle.');
  }
  runCommand('codesign', ['--verify', '--deep', '--strict', appDirectory]);
  runCommand('xcodebuild', [
    '-exportArchive',
    '-archivePath',
    archivePath,
    '-exportPath',
    exportDirectory,
    '-exportOptionsPlist',
    exportOptions,
    ...authenticationArgs,
    ...(options.allowProvisioningUpdates ? ['-allowProvisioningUpdates'] : []),
  ]);
  const ipaFiles = fs
    .readdirSync(exportDirectory)
    .filter(file => file.endsWith('.ipa'))
    .map(file => path.join(exportDirectory, file));
  if (ipaFiles.length !== 1) {
    throw new Error(`Expected one exported IPA, found ${ipaFiles.length}.`);
  }
  return ipaFiles[0];
}

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function gitSource(): { commit: string | null; dirty: boolean | null } {
  const commit = captureCommand('git', ['rev-parse', 'HEAD']);
  const status = captureCommand('git', ['status', '--porcelain']);
  return {
    commit: commit.status === 0 ? commit.output.trim() : null,
    dirty: status.status === 0 ? Boolean(status.output.trim()) : null,
  };
}

function publishArtifact(
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
  if (fs.existsSync(layout.manifestPath)) {
    try {
      const existing = JSON.parse(
        fs.readFileSync(layout.manifestPath, 'utf8'),
      ) as {
        artifacts?: Record<string, PublishedArtifact>;
      };
      existingArtifacts = existing.artifacts || {};
    } catch {
      existingArtifacts = {};
    }
  }
  const legacyArtifact = existingArtifacts[options.platform];
  if (legacyArtifact) {
    const legacyFormat = path.extname(legacyArtifact.file).slice(1);
    if (FORMATS.includes(legacyFormat as PackageFormat)) {
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
    createdAt: new Date().toISOString(),
    artifacts: {
      ...existingArtifacts,
      [options.format]: artifact,
    },
  };
  fs.writeFileSync(
    layout.manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return artifact;
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

export function main(args = process.argv.slice(2)): void {
  const options = parsePackageOptions(args);
  if (options.help) {
    console.log(HELP);
    return;
  }
  const sourceState = gitSource();
  const { config: brand } = readBrand(options.brandId);
  validateBrandForPackage(options, brand);
  if (options.platform === 'android') {
    validateAndroidSigning(options, brand, process.env);
  } else {
    validateIosReadiness(options, brand, process.env);
  }

  generateBrand({
    brandId: options.brandId,
    environment: options.environment,
    versionName: options.versionName,
    buildNumber: options.buildNumber,
  });
  if (!options.skipChecks) {
    runQualityChecks();
  }

  const layout = resolveArtifactLayout(options);
  const nativeArtifact =
    options.platform === 'android'
      ? packageAndroid(options).artifact
      : packageIos(options, brand, layout);
  const artifact = publishArtifact(
    nativeArtifact,
    options,
    brand,
    layout,
    sourceState,
  );
  console.log(`\nPackage complete: ${layout.artifactPath}`);
  console.log(`SHA-256: ${artifact.sha256}`);
  if (!artifact.publishable) {
    console.log('This artifact is marked non-publishable.');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      `\nPackaging failed: ${error instanceof Error ? error.message : error}`,
    );
    process.exitCode = 1;
  }
}
