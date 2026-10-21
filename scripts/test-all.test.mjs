import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChecks, runChecks } from './test-all.mjs';

test('buildChecks returns the ordered repository check contract', () => {
  assert.deepEqual(buildChecks(), [
    ['frontend tests', 'npm', ['--prefix', 'frontend', 'test']],
    ['backend tests', 'npm', ['--prefix', 'backend', 'test']],
    ['frontend lint', 'npm', ['--prefix', 'frontend', 'run', 'lint']],
    ['frontend build', 'npm', ['--prefix', 'frontend', 'run', 'build']],
  ]);
});

test('runChecks uses the supplied working directory and stops at the first failure', () => {
  const calls = [];
  const exitCode = runChecks(buildChecks(), {
    cwd: '/offline/repository',
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 17 };
    },
  });

  assert.equal(exitCode, 17);
  assert.equal(calls.length, 1);
  const expectedCommand = process.platform === 'win32'
    ? (process.env.ComSpec || 'cmd.exe')
    : 'npm';
  const expectedArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm', '--prefix', 'frontend', 'test']
    : ['--prefix', 'frontend', 'test'];
  assert.equal(calls[0].command, expectedCommand);
  assert.deepEqual(calls[0].args, expectedArgs);
  assert.equal(calls[0].options.cwd, '/offline/repository');
  assert.deepEqual(calls[0].options.stdio, 'inherit');
});

test('runChecks completes when every injected check succeeds', () => {
  let callCount = 0;
  const exitCode = runChecks([
    ['first', 'node', ['--version']],
    ['second', 'node', ['--version']],
  ], {
    spawn() {
      callCount += 1;
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.equal(callCount, 2);
});
