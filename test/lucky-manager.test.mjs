import assert from 'node:assert/strict';
import test from 'node:test';

import { LuckyManager } from '../central-hub/modules/lucky-manager.mjs';

test('LuckyManager defaults lucky apiBase to /666 endpoint', () => {
  const previous = process.env.LUCKY_API_BASE;

  try {
    delete process.env.LUCKY_API_BASE;

    const manager = new LuckyManager({}, { state: {} }, null);
    assert.equal(manager.luckyConfig.apiBase, 'http://192.168.3.2:16601/666');
  } finally {
    if (previous === undefined) delete process.env.LUCKY_API_BASE;
    else process.env.LUCKY_API_BASE = previous;
  }
});
