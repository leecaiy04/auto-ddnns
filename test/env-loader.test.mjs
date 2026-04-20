import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';

import {
  loadEnvFile,
  loadEnvFileAsync,
  parseEnvContent
} from '../lib/utils/env-loader.mjs';

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

test('parseEnvContent parses comments, quotes and equals signs', () => {
  const env = parseEnvContent(`
# ignored
ALPHA=1
BETA=two=parts
GAMMA="quoted value"
DELTA='single quoted'
INVALID_LINE
  
`);

  assert.deepEqual(env, {
    ALPHA: '1',
    BETA: 'two=parts',
    GAMMA: 'quoted value',
    DELTA: 'single quoted'
  });
});

test('loadEnvFile loads values from an explicit path', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auto-dnns-env-sync-'));
  const envPath = path.join(tempDir, '.env');
  const keys = ['TEST_ENV_ALPHA', 'TEST_ENV_BETA'];
  const previousEnv = snapshotEnv(keys);

  try {
    await writeFile(envPath, 'TEST_ENV_ALPHA=alpha\nTEST_ENV_BETA=beta=value\n', 'utf-8');

    delete process.env.TEST_ENV_ALPHA;
    delete process.env.TEST_ENV_BETA;

    const env = loadEnvFile(envPath);

    assert.equal(env.TEST_ENV_ALPHA, 'alpha');
    assert.equal(env.TEST_ENV_BETA, 'beta=value');
    assert.equal(process.env.TEST_ENV_ALPHA, 'alpha');
    assert.equal(process.env.TEST_ENV_BETA, 'beta=value');
  } finally {
    restoreEnv(previousEnv);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('loadEnvFileAsync respects search paths without mutating process.env', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auto-dnns-env-async-'));
  const envPath = path.join(tempDir, '.env');
  const key = 'TEST_ENV_ASYNC_ONLY';
  const previousEnv = snapshotEnv([key]);

  try {
    await writeFile(envPath, `${key}=from-file\n`, 'utf-8');
    delete process.env[key];

    const env = await loadEnvFileAsync({
      searchPaths: [path.join(tempDir, 'missing.env'), envPath],
      mutateProcessEnv: false
    });

    assert.equal(env[key], 'from-file');
    assert.equal(process.env[key], undefined);
  } finally {
    restoreEnv(previousEnv);
    await rm(tempDir, { recursive: true, force: true });
  }
});
