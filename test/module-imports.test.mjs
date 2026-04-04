import assert from 'node:assert/strict';
import test from 'node:test';

test('lucky-api falls back to LUCKY_OPEN_TOKEN', async () => {
  const previousAdminToken = process.env.LUCKY_ADMIN_TOKEN;
  const previousOpenToken = process.env.LUCKY_OPEN_TOKEN;
  const luckyApi = await import('../lib/api-clients/lucky-api.mjs');

  try {
    delete process.env.LUCKY_ADMIN_TOKEN;
    process.env.LUCKY_OPEN_TOKEN = 'fallback-open-token';

    assert.equal(luckyApi.getAdminToken(), '');
    assert.equal(luckyApi.getOpenToken(), 'fallback-open-token');
  } finally {
    if (previousAdminToken === undefined) {
      delete process.env.LUCKY_ADMIN_TOKEN;
    } else {
      process.env.LUCKY_ADMIN_TOKEN = previousAdminToken;
    }

    if (previousOpenToken === undefined) {
      delete process.env.LUCKY_OPEN_TOKEN;
    } else {
      process.env.LUCKY_OPEN_TOKEN = previousOpenToken;
    }
  }
});

test('sync-lucky-to-sunpanel can be imported without env loader errors', async () => {
  await assert.doesNotReject(() => import('../scripts/sync-lucky-to-sunpanel.mjs'));
});
