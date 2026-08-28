import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function executable(name: string, platform = process.platform): string {
  return platform === 'win32' ? `${name}.exe` : name;
}

export function findAndroidSdk(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  homeDirectory = os.homedir(),
): string | undefined {
  const candidates = [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Android', 'Sdk'),
    env.HOME && path.join(env.HOME, 'Android', 'Sdk'),
    platform === 'win32'
      ? path.join(homeDirectory, 'AppData', 'Local', 'Android', 'Sdk')
      : path.join(homeDirectory, 'Library', 'Android', 'sdk'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find(candidate =>
    fs.existsSync(
      path.join(candidate, 'platform-tools', executable('adb', platform)),
    ),
  );
}

export function androidEnvironment(
  sdk: string,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const sdkPaths = [
    path.join(sdk, 'platform-tools'),
    path.join(sdk, 'emulator'),
  ];
  return {
    ...env,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    PATH: `${sdkPaths.join(path.delimiter)}${path.delimiter}${env.PATH || ''}`,
  };
}
