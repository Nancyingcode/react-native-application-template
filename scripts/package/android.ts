import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../brand-utils';
import { androidEnvironment, findAndroidSdk } from '../android-utils';
import { runCommand, captureCommand } from './command';
import { ANDROID_BUILD_TASK } from './config';
import type { AndroidPackageOptions, AndroidPackageFormat } from './types';

function findAndroidArtifact(format: AndroidPackageFormat): string {
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

function findJavaExecutable(env: NodeJS.ProcessEnv): string {
  return env.JAVA_HOME
    ? path.join(
        env.JAVA_HOME,
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
  format: AndroidPackageFormat,
  signed: boolean,
  sdk: string,
  env: NodeJS.ProcessEnv,
): void {
  const result =
    format === 'apk'
      ? captureCommand(
          findJavaExecutable(env),
          ['-jar', findApkSignerJar(sdk), 'verify', '--verbose', artifact],
          { env },
        )
      : captureCommand(
          'jarsigner',
          [
            '-J-Duser.language=en',
            '-J-Duser.country=US',
            '-verify',
            '-certs',
            artifact,
          ],
          { env },
        );
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

export function packageAndroid(
  options: AndroidPackageOptions,
  env: NodeJS.ProcessEnv,
): string {
  const sdk = findAndroidSdk(env);
  if (!sdk) {
    throw new Error(
      'Android SDK not found. Set ANDROID_HOME or install Android Studio.',
    );
  }
  const java = findJavaExecutable(env);
  const wrapperJar = path.join(
    ROOT,
    'android',
    'gradle',
    'wrapper',
    'gradle-wrapper.jar',
  );
  const task = ANDROID_BUILD_TASK[options.format];
  const args = [
    ...(options.clean ? ['clean'] : []),
    task,
    '--no-daemon',
    `-PversionName=${options.versionName}`,
    `-PversionCode=${options.buildNumber}`,
    `-PreleaseSigningMode=${options.unsigned ? 'unsigned' : 'signed'}`,
    `-PreactNativeArchitectures=${
      env.ANDROID_ARCHITECTURES || 'armeabi-v7a,arm64-v8a'
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
      env: androidEnvironment(sdk, env),
    },
  );
  const artifact = findAndroidArtifact(options.format);
  verifyAndroidArtifact(artifact, options.format, !options.unsigned, sdk, env);
  return artifact;
}
