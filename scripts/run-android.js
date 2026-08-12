'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 8081;

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    process.env.HOME && path.join(process.env.HOME, 'Android', 'Sdk'),
    path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
  ].filter(Boolean);

  return candidates.find(candidate =>
    fs.existsSync(path.join(candidate, 'platform-tools', executable('adb'))),
  );
}

function executable(name) {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function pathEntries(sdk) {
  return [path.join(sdk, 'platform-tools'), path.join(sdk, 'emulator')];
}

function readProperties(file) {
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
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      }),
  );
}

function hasOption(args, option) {
  return args.some(argument => argument === option || argument.startsWith(`${option}=`));
}

function isPortOpen(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({host: '127.0.0.1', port});
    const finish = value => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function isMetro(port) {
  return new Promise(resolve => {
    const request = http.get(
      {host: '127.0.0.1', port, path: '/status', timeout: 800},
      response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          body += chunk;
        });
        response.on('end', () => resolve(body.trim() === 'packager-status:running'));
      },
    );
    request.once('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.once('error', () => resolve(false));
  });
}

async function main() {
  const sdk = findAndroidSdk();
  if (!sdk) {
    console.error(
      'Android SDK not found. Set ANDROID_HOME or install Android Studio with platform-tools.',
    );
    process.exitCode = 1;
    return;
  }

  const env = {
    ...process.env,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    PATH: `${pathEntries(sdk).join(path.delimiter)}${path.delimiter}${process.env.PATH || ''}`,
  };
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
  const result = spawnSync(process.execPath, [cli, 'run-android', ...forwarded], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
    windowsHide: false,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
