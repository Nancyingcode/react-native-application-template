import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { androidEnvironment, findAndroidSdk } from './android-utils';

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 8081;

function readProperties(file: string): Record<string, string> {
  if (!fs.existsSync(file)) {
    return {};
  }
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const separator = line.indexOf('=');
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim(),
        ];
      }),
  );
}

function hasOption(args: string[], option: string): boolean {
  return args.some(
    argument => argument === option || argument.startsWith(`${option}=`),
  );
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function isMetro(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const request = http.get(
      { host: '127.0.0.1', port, path: '/status', timeout: 3000 },
      response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          body += chunk;
        });
        response.on('end', () =>
          resolve(body.trim() === 'packager-status:running'),
        );
      },
    );
    request.once('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.once('error', () => resolve(false));
  });
}

async function main(): Promise<void> {
  const sdk = findAndroidSdk();
  if (!sdk) {
    console.error(
      'Android SDK not found. Set ANDROID_HOME or install Android Studio with platform-tools.',
    );
    process.exitCode = 1;
    return;
  }

  const env = androidEnvironment(sdk);
  const forwarded = process.argv.slice(2);
  const nativeProperties = readProperties(
    path.join(ROOT, 'generated', 'native', 'android.properties'),
  );
  if (nativeProperties.applicationId && !hasOption(forwarded, '--appId')) {
    // The RN CLI cannot statically infer a Gradle applicationId loaded from
    // brand properties, so pass the generated value explicitly.
    forwarded.push('--appId', nativeProperties.applicationId);
  }
  const portIndex = forwarded.indexOf('--port');
  const port = portIndex >= 0 ? Number(forwarded[portIndex + 1]) : DEFAULT_PORT;
  const portOpen = await isPortOpen(port);
  const metroRunning = portOpen && (await isMetro(port));

  if (portOpen && !metroRunning) {
    console.error(
      `Port ${port} is occupied by a non-Metro process. Stop it or run with --port <free-port>.`,
    );
    process.exitCode = 1;
    return;
  }
  if (metroRunning && !forwarded.includes('--no-packager')) {
    forwarded.push('--no-packager');
    console.log(`Reusing Metro already running on port ${port}.`);
  }

  console.log(`Android SDK: ${sdk}`);
  const cli = path.join(ROOT, 'node_modules', 'react-native', 'cli.js');
  const result = spawnSync(
    process.execPath,
    [cli, 'run-android', ...forwarded],
    {
      cwd: ROOT,
      env,
      stdio: 'inherit',
      windowsHide: false,
    },
  );

  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
