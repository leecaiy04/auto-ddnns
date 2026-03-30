import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';

import { loadConfigWithEnv } from '../central-hub/modules/config-loader.mjs';

test('loadConfigWithEnv lets env values override json config', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'auto-dnns-config-'));
  const configPath = path.join(tempDir, 'hub.json');
  const envPath = path.join(tempDir, '.env');

  try {
    await writeFile(
      configPath,
      JSON.stringify({
        server: { port: 3000, host: '0.0.0.0' },
        router: { gateway: '192.168.3.1', checkInterval: 300 },
        lucky: { apiBase: 'http://json-lucky', syncInterval: 600 },
        sunpanel: { apiBase: 'http://json-sunpanel', apiToken: 'json-token' },
        logging: { level: 'info' }
      }),
      'utf-8'
    );

    await writeFile(
      envPath,
      [
        'HUB_PORT=61000',
        'HUB_HOST=127.0.0.1',
        'ROUTER_GATEWAY=10.0.0.1',
        'LUCKY_API_BASE=http://env-lucky',
        'LUCKY_SYNC_INTERVAL=60',
        'SUNPANEL_API_TOKEN=env-token',
        'LOG_LEVEL=debug'
      ].join('\n'),
      'utf-8'
    );

    const config = await loadConfigWithEnv(configPath, envPath);

    assert.equal(config.server.port, 61000);
    assert.equal(config.server.host, '127.0.0.1');
    assert.equal(config.router.gateway, '10.0.0.1');
    assert.equal(config.lucky.apiBase, 'http://env-lucky');
    assert.equal(config.lucky.syncInterval, 60);
    assert.equal(config.sunpanel.apiToken, 'env-token');
    assert.equal(config.logging.level, 'debug');
    assert.equal(config.sunpanel.apiBase, 'http://json-sunpanel');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
