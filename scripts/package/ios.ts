import fs from 'node:fs';
import path from 'node:path';
import type { BrandConfig } from '../../src/brand/types';
import { ROOT } from '../brand-utils';
import { runCommand } from './command';
import { IOS_CONFIG } from './config';
import type { IosPackageOptions, ArtifactLayout } from './types';

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
  const profiles = provisioningProfile
    ? `\n\t<key>provisioningProfiles</key>\n\t<dict>\n\t\t<key>${xml(
        bundleId,
      )}</key>\n\t\t<string>${xml(provisioningProfile)}</string>\n\t</dict>`
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

export function packageIos(
  options: IosPackageOptions,
  brand: BrandConfig,
  layout: ArtifactLayout,
  env: NodeJS.ProcessEnv,
): string {
  if (!options.skipPods) {
    runCommand('bundle', ['check'], { env });
    runCommand(
      'bundle',
      ['exec', 'pod', 'install', '--project-directory=ios'],
      { env },
    );
  }
  const workspace = path.join(ROOT, 'ios', IOS_CONFIG.workspace);
  if (!fs.existsSync(workspace)) {
    throw new Error(`CocoaPods workspace not found: ${workspace}`);
  }
  fs.mkdirSync(layout.platformDirectory, { recursive: true });
  const teamId = env.IOS_DEVELOPMENT_TEAM || brand.native.ios.teamId;
  if (!teamId)
    throw new Error(
      'iOS packaging requires IOS_DEVELOPMENT_TEAM or native.ios.teamId.',
    );
  const profile =
    env.IOS_PROVISIONING_PROFILE || brand.native.ios.provisioningProfile;
  const archivePath = path.join(layout.platformDirectory, IOS_CONFIG.archive);
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
  if (
    env.APP_STORE_CONNECT_API_KEY_PATH &&
    env.APP_STORE_CONNECT_API_KEY_ID &&
    env.APP_STORE_CONNECT_API_ISSUER_ID
  ) {
    authenticationArgs.push(
      '-authenticationKeyPath',
      env.APP_STORE_CONNECT_API_KEY_PATH,
      '-authenticationKeyID',
      env.APP_STORE_CONNECT_API_KEY_ID,
      '-authenticationKeyIssuerID',
      env.APP_STORE_CONNECT_API_ISSUER_ID,
    );
  }
  const archiveArgs = [
    '-workspace',
    workspace,
    '-scheme',
    IOS_CONFIG.scheme,
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
    `IPHONEOS_DEPLOYMENT_TARGET=${IOS_CONFIG.deploymentTarget}`,
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
    runCommand('xcodebuild', archiveArgs.slice(0, -1).concat('clean'), { env });
  }
  runCommand('xcodebuild', archiveArgs, { env });
  const appDirectory = path.join(
    archivePath,
    'Products',
    'Applications',
    IOS_CONFIG.application,
  );
  if (!fs.existsSync(appDirectory)) {
    throw new Error('Xcode archive completed without an application bundle.');
  }
  runCommand('codesign', ['--verify', '--deep', '--strict', appDirectory], {
    env,
  });
  runCommand(
    'xcodebuild',
    [
      '-exportArchive',
      '-archivePath',
      archivePath,
      '-exportPath',
      exportDirectory,
      '-exportOptionsPlist',
      exportOptions,
      ...authenticationArgs,
      ...(options.allowProvisioningUpdates
        ? ['-allowProvisioningUpdates']
        : []),
    ],
    { env },
  );
  const ipaFiles = fs
    .readdirSync(exportDirectory)
    .filter(file => file.endsWith('.ipa'))
    .map(file => path.join(exportDirectory, file));
  if (ipaFiles.length !== 1) {
    throw new Error(`Expected one exported IPA, found ${ipaFiles.length}.`);
  }
  return ipaFiles[0];
}
