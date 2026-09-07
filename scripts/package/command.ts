import { spawnSync } from 'node:child_process';
import { ROOT } from '../brand-utils';
import type { CommandOptions, CommandResult } from './types';

function quoteForDisplay(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions,
): void {
  console.log(`\n> ${[command, ...args].map(quoteForDisplay).join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env,
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

export function captureCommand(
  command: string,
  args: string[],
  options: CommandOptions,
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env,
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

export function runNpmScript(script: string, env: NodeJS.ProcessEnv): void {
  const npmExecPath = env.npm_execpath;
  if (npmExecPath) {
    runCommand(process.execPath, [npmExecPath, 'run', script], { env });
    return;
  }
  runCommand(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', script],
    { env },
  );
}
