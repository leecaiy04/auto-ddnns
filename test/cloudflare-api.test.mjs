import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCfAuthConfig,
  verifyToken,
  listDnsRecords,
  upsertDnsRecord
} from '../lib/api-clients/cloudflare-api.mjs';

function snapshotEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const ENV_KEYS = ['CF_API_TOKEN', 'CF_ZONE_ID', 'CF_DOMAIN'];

// ==================== getCfAuthConfig tests ====================

test('getCfAuthConfig returns ready=true when token and zoneId are set', () => {
  const config = {
    apiToken: 'test-token',
    zoneId: 'test-zone-id',
    domain: 'example.com'
  };
  const result = getCfAuthConfig(config);

  assert.equal(result.hasToken, true);
  assert.equal(result.hasZoneId, true);
  assert.equal(result.hasDomain, true);
  assert.equal(result.ready, true);
  assert.equal(result.domain, 'example.com');
});

test('getCfAuthConfig returns ready=false when token is missing', () => {
  const config = {
    apiToken: '',
    zoneId: 'test-zone-id',
    domain: 'example.com'
  };
  const result = getCfAuthConfig(config);

  assert.equal(result.hasToken, false);
  assert.equal(result.ready, false);
});

test('getCfAuthConfig returns ready=false when zoneId is missing', () => {
  const config = {
    apiToken: 'test-token',
    zoneId: '',
    domain: 'example.com'
  };
  const result = getCfAuthConfig(config);

  assert.equal(result.hasZoneId, false);
  assert.equal(result.ready, false);
});

test('getCfAuthConfig falls back to env vars when no config provided', () => {
  const previousEnv = snapshotEnv(ENV_KEYS);

  try {
    process.env.CF_API_TOKEN = 'env-token';
    process.env.CF_ZONE_ID = 'env-zone';
    process.env.CF_DOMAIN = 'env.example.com';

    const result = getCfAuthConfig();

    assert.equal(result.hasToken, true);
    assert.equal(result.hasZoneId, true);
    assert.equal(result.domain, 'env.example.com');
    assert.equal(result.ready, true);
  } finally {
    restoreEnv(previousEnv);
  }
});

// ==================== verifyToken tests ====================

test('verifyToken calls CF API with correct auth header', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, options });

      return new Response(JSON.stringify({
        success: true,
        result: { status: 'active', expires_on: '2027-01-01T00:00:00Z' }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const config = { apiToken: 'my-cf-token', zoneId: 'zone1', domain: 'test.com' };
    const result = await verifyToken(config);

    assert.equal(result.valid, true);
    assert.equal(result.status, 'active');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('/user/tokens/verify'));
    assert.equal(calls[0].options.headers.Authorization, 'Bearer my-cf-token');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('verifyToken returns valid=false for inactive token', async () => {
  const previousFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({
        success: true,
        result: { status: 'expired' }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const config = { apiToken: 'expired-token', zoneId: 'zone1', domain: 'test.com' };
    const result = await verifyToken(config);

    assert.equal(result.valid, false);
    assert.equal(result.status, 'expired');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

// ==================== listDnsRecords tests ====================

test('listDnsRecords fetches records for zone', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, options });

      return new Response(JSON.stringify({
        success: true,
        result: [
          { id: 'rec-1', type: 'A', name: 'app.test.com', content: '1.2.3.4', proxied: true },
          { id: 'rec-2', type: 'AAAA', name: 'app.test.com', content: '::1', proxied: false }
        ]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const config = { apiToken: 'token', zoneId: 'zone1', domain: 'test.com' };
    const records = await listDnsRecords('zone1', {}, config);

    assert.equal(records.length, 2);
    assert.equal(records[0].name, 'app.test.com');
    assert.equal(records[0].type, 'A');
    assert.ok(calls[0].url.includes('/zones/zone1/dns_records'));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

// ==================== upsertDnsRecord tests ====================

test('upsertDnsRecord creates a new record when none exists', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET' });

      // First call: list (find) - returns empty
      if (url.includes('dns_records') && (!options.method || options.method === 'GET')) {
        return new Response(JSON.stringify({
          success: true,
          result: []
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Second call: create
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'new-rec', type: body.type, name: body.name, content: body.content, proxied: body.proxied }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected: ${options.method} ${url}`);
    };

    const config = { apiToken: 'token', zoneId: 'zone1', domain: 'test.com' };
    const result = await upsertDnsRecord(
      { type: 'A', name: 'new.test.com', content: '5.6.7.8', proxied: true },
      'zone1',
      config
    );

    assert.equal(result.action, 'created');
    assert.equal(result.record.name, 'new.test.com');
    assert.equal(result.record.content, '5.6.7.8');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('upsertDnsRecord updates existing record when content differs', async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET' });

      // First call: list (find) - returns existing record with different IP
      if (url.includes('dns_records') && (!options.method || options.method === 'GET')) {
        return new Response(JSON.stringify({
          success: true,
          result: [{ id: 'existing-rec', type: 'A', name: 'app.test.com', content: '1.1.1.1', proxied: true }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Second call: update
      if (options.method === 'PUT') {
        const body = JSON.parse(options.body);
        return new Response(JSON.stringify({
          success: true,
          result: { id: 'existing-rec', type: body.type, name: body.name, content: body.content, proxied: body.proxied }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected: ${options.method} ${url}`);
    };

    const config = { apiToken: 'token', zoneId: 'zone1', domain: 'test.com' };
    const result = await upsertDnsRecord(
      { type: 'A', name: 'app.test.com', content: '2.2.2.2', proxied: true },
      'zone1',
      config
    );

    assert.equal(result.action, 'updated');
    assert.equal(result.record.content, '2.2.2.2');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('upsertDnsRecord returns unchanged when record matches', async () => {
  const previousFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url, options = {}) => {
      // Find returns record with same content and proxied status
      return new Response(JSON.stringify({
        success: true,
        result: [{ id: 'same-rec', type: 'A', name: 'same.test.com', content: '3.3.3.3', proxied: true }]
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const config = { apiToken: 'token', zoneId: 'zone1', domain: 'test.com' };
    const result = await upsertDnsRecord(
      { type: 'A', name: 'same.test.com', content: '3.3.3.3', proxied: true },
      'zone1',
      config
    );

    assert.equal(result.action, 'unchanged');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('cloudflare API throws on missing token', async () => {
  const previousEnv = snapshotEnv(ENV_KEYS);

  try {
    delete process.env.CF_API_TOKEN;
    delete process.env.CF_ZONE_ID;
    delete process.env.CF_DOMAIN;

    await assert.rejects(
      () => verifyToken({ apiToken: '', zoneId: 'z', domain: 'd' }),
      { message: /CF_API_TOKEN/ }
    );
  } finally {
    restoreEnv(previousEnv);
  }
});
