import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { CloudflareManager } from '../modules/cloudflare-manager/index.mjs';

const ENV_KEYS = ['CF_API_TOKEN', 'CF_ZONE_ID', 'CF_DOMAIN', 'PUBLIC_IPV4'];

let originalFetch;
let fetchCalls;
let envSnapshot;

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStateManager(initialState = {}) {
  return {
    saves: 0,
    state: clone(initialState),
    async save() {
      this.saves += 1;
    }
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function textResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' }
  });
}

function installFetchMock(handler) {
  fetchCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    const call = {
      url: String(url),
      method: options.method || 'GET',
      headers: { ...(options.headers || {}) },
      body: options.body ? JSON.parse(options.body) : null
    };
    fetchCalls.push(call);
    return handler(call);
  };
}

describe('cloudflare-manager', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    envSnapshot = snapshotEnv(ENV_KEYS);
    restoreEnv({
      CF_API_TOKEN: undefined,
      CF_ZONE_ID: undefined,
      CF_DOMAIN: undefined,
      PUBLIC_IPV4: undefined
    });
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnapshot);
  });

  it('hasAuthConfig and getStatus reflect auth readiness', () => {
    const missingAuthState = createStateManager({});
    const missingAuthManager = new CloudflareManager({ enabled: true, domain: 'example.com' }, missingAuthState);

    assert.equal(missingAuthManager.hasAuthConfig(), false);
    assert.deepEqual(missingAuthManager.getStatus(), {
      enabled: false,
      domain: 'example.com',
      proxied: true,
      lastSync: null,
      recordCount: 0,
      authReady: false
    });
    assert.deepEqual(missingAuthState.state.cloudflare, {
      lastSync: null,
      records: {},
      syncStatus: {}
    });

    const readyManager = new CloudflareManager({
      enabled: true,
      apiToken: 'cf-token',
      zoneId: 'zone-1',
      domain: 'example.com',
      proxied: false
    }, createStateManager({
      cloudflare: {
        lastSync: '2026-04-25T00:00:00Z',
        records: {},
        syncStatus: {
          'app.example.com': { serviceId: 'app' }
        }
      }
    }));

    assert.equal(readyManager.hasAuthConfig(), true);
    assert.deepEqual(readyManager.getStatus(), {
      enabled: true,
      domain: 'example.com',
      proxied: false,
      lastSync: '2026-04-25T00:00:00Z',
      recordCount: 1,
      authReady: true
    });
  });

  it('syncServicesToCF returns zero counts when module is disabled or auth is unavailable', async () => {
    const disabledManager = new CloudflareManager({ enabled: false }, createStateManager({}));
    const missingAuthManager = new CloudflareManager({ enabled: true, domain: 'example.com' }, createStateManager({}));

    const disabledResult = await disabledManager.syncServicesToCF([{ id: 'svc' }], {});
    const missingAuthResult = await missingAuthManager.syncServicesToCF([{ id: 'svc' }], {});

    assert.deepEqual(disabledResult, {
      success: 0,
      failed: 0,
      skipped: 0,
      updated: 0,
      unchanged: 0,
      details: []
    });
    assert.deepEqual(missingAuthResult, disabledResult);
    assert.equal(fetchCalls.length, 0);
  });

  it('syncServicesToCF handles A+AAAA, A-only, unchanged, failed and skipped services', async () => {
    installFetchMock((call) => {
      const url = new URL(call.url);
      const pathname = url.pathname;
      const name = url.searchParams.get('name');
      const type = url.searchParams.get('type');

      if (call.method === 'GET' && pathname === '/client/v4/zones/zone-1/dns_records') {
        if (name === 'svc-v6.example.com' && type === 'A') {
          return jsonResponse({
            success: true,
            result: [{ id: 'rec-a-v6', type: 'A', name, content: '1.2.3.4', proxied: true }]
          });
        }

        if (name === 'svc-v6.example.com' && type === 'AAAA') {
          return jsonResponse({
            success: true,
            result: [{ id: 'rec-aaaa-v6', type: 'AAAA', name, content: '240e::old', proxied: true }]
          });
        }

        if (name === 'svc-v4.example.com' && type === 'A') {
          return jsonResponse({ success: true, result: [] });
        }

        if (name === 'svc-same.example.com' && type === 'A') {
          return jsonResponse({
            success: true,
            result: [{ id: 'rec-a-same', type: 'A', name, content: '1.2.3.4', proxied: true }]
          });
        }

        if (name === 'svc-fail.example.com' && type === 'A') {
          return jsonResponse({
            success: false,
            errors: [{ code: 1000, message: 'lookup failed' }]
          });
        }
      }

      if (call.method === 'PUT' && pathname === '/client/v4/zones/zone-1/dns_records/rec-aaaa-v6') {
        return jsonResponse({
          success: true,
          result: { id: 'rec-aaaa-v6', ...call.body }
        });
      }

      if (call.method === 'POST' && pathname === '/client/v4/zones/zone-1/dns_records') {
        return jsonResponse({
          success: true,
          result: { id: `created-${call.body.name}-${call.body.type}`, ...call.body }
        });
      }

      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });

    process.env.PUBLIC_IPV4 = '1.2.3.4';

    const stateManager = createStateManager({});
    const manager = new CloudflareManager({
      enabled: true,
      apiToken: 'cf-token',
      zoneId: 'zone-1',
      domain: 'example.com'
    }, stateManager);

    const services = [
      { id: 'svc-v6', name: 'Service V6', device: '10', enableProxy: true, cfDomain: 'svc-v6.example.com' },
      { id: 'svc-v4', name: 'Service V4', device: '20', enableProxy: true, cfDomain: 'svc-v4.example.com' },
      { id: 'svc-same', name: 'Service Same', device: '30', enableProxy: true, cfDomain: 'svc-same.example.com' },
      { id: 'svc-fail', name: 'Service Fail', device: '40', enableProxy: true, cfDomain: 'svc-fail.example.com' },
      { id: 'svc-skip', name: 'Service Skip', device: '50', enableProxy: false, cfDomain: 'svc-skip.example.com' }
    ];

    const result = await manager.syncServicesToCF(services, {
      '10': '240e::10'
    });

    assert.deepEqual({
      success: result.success,
      failed: result.failed,
      skipped: result.skipped,
      updated: result.updated,
      unchanged: result.unchanged
    }, {
      success: 2,
      failed: 1,
      skipped: 1,
      updated: 1,
      unchanged: 1
    });

    assert.deepEqual(result.details.map((detail) => ({ service: detail.service, action: detail.action })), [
      { service: 'svc-v6', action: 'updated' },
      { service: 'svc-v4', action: 'created' },
      { service: 'svc-same', action: 'unchanged' },
      { service: 'svc-fail', action: 'error' }
    ]);

    assert.equal(stateManager.saves, 1);
    assert.ok(stateManager.state.cloudflare.lastSync);
    assert.deepEqual(Object.keys(stateManager.state.cloudflare.syncStatus).sort(), [
      'svc-same.example.com',
      'svc-v4.example.com',
      'svc-v6.example.com'
    ]);
    assert.equal(stateManager.state.cloudflare.syncStatus['svc-v6.example.com'].serviceId, 'svc-v6');
    assert.equal(stateManager.state.cloudflare.syncStatus['svc-v6.example.com'].ip, '1.2.3.4');

    const createdARecord = fetchCalls.find((call) => call.method === 'POST' && call.body?.name === 'svc-v4.example.com');
    assert.deepEqual(createdARecord.body, {
      type: 'A',
      name: 'svc-v4.example.com',
      content: '1.2.3.4',
      proxied: true,
      ttl: 1,
      comment: 'Service V4 - auto-dnns (A)'
    });

    const updatedAAAARecord = fetchCalls.find((call) => call.method === 'PUT');
    assert.deepEqual(updatedAAAARecord.body, {
      type: 'AAAA',
      name: 'svc-v6.example.com',
      content: '240e::10',
      proxied: true,
      ttl: 1,
      comment: 'Service V6 - auto-dnns (AAAA)'
    });
  });

  it('syncServicesToCF uses AAAA-only records and skips services without any IP when public IPv4 is unavailable', async () => {
    installFetchMock((call) => {
      const url = new URL(call.url);
      const pathname = url.pathname;

      if (call.method === 'GET' && call.url === 'https://api.ipify.org?format=json') {
        throw new Error('ipify down');
      }

      if (call.method === 'GET' && call.url === 'https://httpbin.org/ip') {
        return jsonResponse({ ignored: true }, 503);
      }

      if (call.method === 'GET' && call.url === 'https://api.ip.sb/ip') {
        throw new Error('ip.sb down');
      }

      if (call.method === 'GET' && pathname === '/client/v4/zones/zone-1/dns_records') {
        return jsonResponse({ success: true, result: [] });
      }

      if (call.method === 'POST' && pathname === '/client/v4/zones/zone-1/dns_records') {
        return jsonResponse({
          success: true,
          result: { id: 'created-aaaa-only', ...call.body }
        });
      }

      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });

    const stateManager = createStateManager({});
    const manager = new CloudflareManager({
      enabled: true,
      apiToken: 'cf-token',
      zoneId: 'zone-1',
      domain: 'example.com'
    }, stateManager);

    const result = await manager.syncServicesToCF([
      { id: 'svc-v6-only', name: 'IPv6 Only', device: '10', enableProxy: true, cfDomain: 'svc-v6-only.example.com' },
      { id: 'svc-no-ip', name: 'No IP', device: '20', enableProxy: true, cfDomain: 'svc-no-ip.example.com' }
    ], {
      '10': '240e::10'
    });

    assert.deepEqual({
      success: result.success,
      failed: result.failed,
      skipped: result.skipped,
      updated: result.updated,
      unchanged: result.unchanged
    }, {
      success: 1,
      failed: 0,
      skipped: 1,
      updated: 0,
      unchanged: 0
    });

    assert.deepEqual(result.details, [
      {
        service: 'svc-v6-only',
        action: 'created',
        domain: 'svc-v6-only.example.com',
        ip: '240e::10'
      },
      {
        service: 'svc-no-ip',
        action: 'skipped',
        reason: '无可用 IP 地址'
      }
    ]);

    const createdRecord = fetchCalls.find((call) => call.method === 'POST');
    assert.deepEqual(createdRecord.body, {
      type: 'AAAA',
      name: 'svc-v6-only.example.com',
      content: '240e::10',
      proxied: true,
      ttl: 1,
      comment: 'IPv6 Only - auto-dnns (AAAA)'
    });
  });

  it('deleteRecord removes local sync status after deleting remote record', async () => {
    installFetchMock((call) => {
      const url = new URL(call.url);
      const pathname = url.pathname;
      const name = url.searchParams.get('name');
      const type = url.searchParams.get('type');

      if (call.method === 'GET' && pathname === '/client/v4/zones/zone-1/dns_records' && name === 'svc.example.com' && type === 'AAAA') {
        return jsonResponse({
          success: true,
          result: [{ id: 'rec-1', type: 'AAAA', name, content: '240e::10', proxied: true }]
        });
      }

      if (call.method === 'DELETE' && pathname === '/client/v4/zones/zone-1/dns_records/rec-1') {
        return jsonResponse({ success: true, result: { id: 'rec-1' } });
      }

      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });

    const stateManager = createStateManager({
      cloudflare: {
        lastSync: '2026-04-25T01:00:00Z',
        records: {},
        syncStatus: {
          'svc.example.com': {
            serviceId: 'svc',
            domain: 'svc.example.com'
          }
        }
      }
    });
    const manager = new CloudflareManager({
      enabled: true,
      apiToken: 'cf-token',
      zoneId: 'zone-1',
      domain: 'example.com'
    }, stateManager);

    const result = await manager.deleteRecord('svc.example.com', 'AAAA');

    assert.deepEqual(result, { action: 'deleted', recordId: 'rec-1' });
    assert.deepEqual(stateManager.state.cloudflare.syncStatus, {});
    assert.equal(stateManager.saves, 1);
  });

  it('_fetchPublicIPv4 falls back to httpbin when ipify fails', async () => {
    installFetchMock((call) => {
      if (call.url === 'https://api.ipify.org?format=json') {
        throw new Error('ipify unavailable');
      }

      if (call.url === 'https://httpbin.org/ip') {
        return jsonResponse({ origin: '9.8.7.6' });
      }

      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });

    const manager = new CloudflareManager({ enabled: true }, createStateManager({}));
    const result = await manager._fetchPublicIPv4();

    assert.equal(result, '9.8.7.6');
    assert.deepEqual(fetchCalls.map((call) => call.url), [
      'https://api.ipify.org?format=json',
      'https://httpbin.org/ip'
    ]);
  });

  it('_fetchPublicIPv4 falls back to ip.sb after earlier providers fail', async () => {
    installFetchMock((call) => {
      if (call.url === 'https://api.ipify.org?format=json') {
        return jsonResponse({ error: 'bad gateway' }, 502);
      }

      if (call.url === 'https://httpbin.org/ip') {
        throw new Error('httpbin unavailable');
      }

      if (call.url === 'https://api.ip.sb/ip') {
        return textResponse('7.7.7.7\n');
      }

      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });

    const manager = new CloudflareManager({ enabled: true }, createStateManager({}));
    const result = await manager._fetchPublicIPv4();

    assert.equal(result, '7.7.7.7');
    assert.deepEqual(fetchCalls.map((call) => call.url), [
      'https://api.ipify.org?format=json',
      'https://httpbin.org/ip',
      'https://api.ip.sb/ip'
    ]);
  });
});
