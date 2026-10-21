import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function buildChecks() {
  return [
    ['frontend tests', 'npm', ['--prefix', 'frontend', 'test']],
    ['backend tests', 'npm', ['--prefix', 'backend', 'test']],
    ['frontend lint', 'npm', ['--prefix', 'frontend', 'run', 'lint']],
    ['frontend build', 'npm', ['--prefix', 'frontend', 'run', 'build']],
  ];
}

export function runChecks(checks = buildChecks(), options = {}) {
  const {
    cwd = REPOSITORY_ROOT,
    spawn = spawnSync,
  } = options;
  const isWindows = process.platform === 'win32';

  for (const [label, command, args] of checks) {
    console.log(`\n==> ${label}`);
    const result = spawn(
      isWindows ? (process.env.ComSpec || 'cmd.exe') : command,
      isWindows ? ['/d', '/s', '/c', command, ...args] : args,
      {
        cwd,
        stdio: 'inherit',
      },
    );
    const exitCode = typeof result.status === 'number' ? result.status : 1;

    if (exitCode !== 0) {
      return exitCode;
    }
  }

  return 0;
}

const isMain = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  process.exitCode = runChecks();
}
