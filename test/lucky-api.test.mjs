import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {
  getLuckyAuthConfig,
  openTokenFetch,
  adminTokenFetch
} from '../modules/lucky-manager/lucky-api.mjs';
import {
  getReverseProxyRules,
  getAllReverseProxies,
  createPort,
  deleteRule
} from '../modules/lucky-manager/lucky-reverseproxy.mjs';

// ── helpers ──

let requestLog = [];
let originalHttpRequest;
let originalHttpsRequest;

function captureRequests() {
  requestLog = [];
  originalHttpRequest = http.request;
  originalHttpsRequest = https.request;

  const capture = (mod) => (opts, cb) => {
    requestLog.push({ protocol: mod === https ? 'https:' : 'http:', opts });
    // respond with a minimal Lucky API response
    const res = {
      statusCode: 200,
      statusMessage: 'OK',
      on: (event, handler) => {
        if (event === 'end') {
          setImmediate(() => handler());
        }
      }
    };
    const req = {
      on: (event, handler) => {
        if (event === 'error') { /* no-op */ }
      },
      write: () => {},
      end: () => setImmediate(() => cb(res))
    };
    return req;
  };

  http.request = capture(http);
  https.request = capture(https);
}

function restoreRequests() {
  http.request = originalHttpRequest;
  https.request = originalHttpsRequest;
}

// ── tests ──

describe('lucky-api config resolution', () => {
  it('getLuckyAuthConfig reports open token auth when token provided', () => {
    const config = getLuckyAuthConfig({
      apiBase: 'https://lucky.example.com:50000/666',
      openToken: 'test-open-token',
      adminToken: ''   // explicitly empty to override any env LUCKY_ADMIN_TOKEN
    });
    assert.equal(config.apiBase, 'https://lucky.example.com:50000/666');
    assert.equal(config.authMode, 'open');
    assert.equal(config.hasOpenToken, true);
    assert.equal(config.hasAdminToken, false);
  });

  it('getLuckyAuthConfig reports admin token auth', () => {
    const config = getLuckyAuthConfig({
      adminToken: 'test-admin-token',
      openToken: ''   // explicitly empty to override any env LUCKY_OPEN_TOKEN
    });
    assert.equal(config.authMode, 'admin');
    assert.equal(config.hasAdminToken, true);
    assert.equal(config.hasOpenToken, false);
  });

  it('getLuckyAuthConfig normalizes trailing slashes', () => {
    const config = getLuckyAuthConfig({
      apiBase: 'https://lucky.example.com:50000/666/'
    });
    assert.equal(config.apiBase, 'https://lucky.example.com:50000/666');
  });
});

describe('lucky-api fetch with explicit config', () => {
  beforeEach(() => captureRequests());
  afterEach(() => restoreRequests());

  it('openTokenFetch sends openToken as URL query param', async () => {
    // Override response to return valid JSON
    http.request = (opts, cb) => {
      requestLog.push({ protocol: 'http:', opts });
      const res = {
        statusCode: 200,
        statusMessage: 'OK',
        on: (event, handler) => {
          if (event === 'data') setImmediate(() => handler('{"ret":0,"ruleList":[]}'));
          if (event === 'end') setImmediate(() => handler());
        }
      };
      const req = { on: () => {}, write: () => {}, end: () => setImmediate(() => cb(res)) };
      return req;
    };

    await openTokenFetch('/api/webservice/rules', {}, {
      apiBase: 'http://lucky-instance.local:16601',
      openToken: 'my-open-token'
    });

    assert.equal(requestLog.length, 1);
    const path = requestLog[0].opts.path;
    assert.ok(path.includes('/api/webservice/rules'));
    assert.ok(path.includes('openToken=my-open-token'));
    assert.equal(requestLog[0].opts.hostname, 'lucky-instance.local');
  });

  it('adminTokenFetch sends lucky-admin-token header', async () => {
    http.request = (opts, cb) => {
      requestLog.push({ protocol: 'http:', opts });
      const res = {
        statusCode: 200,
        statusMessage: 'OK',
        on: (event, handler) => {
          if (event === 'data') setImmediate(() => handler('{"ret":0}'));
          if (event === 'end') setImmediate(() => handler());
        }
      };
      const req = { on: () => {}, write: () => {}, end: () => setImmediate(() => cb(res)) };
      return req;
    };

    await adminTokenFetch('/api/webservice/rules', {}, {
      apiBase: 'http://lucky-admin.local:16601',
      adminToken: 'admin-secret',
      openToken: ''
    });

    assert.equal(requestLog.length, 1);
    assert.equal(requestLog[0].opts.headers['lucky-admin-token'], 'admin-secret');
  });
});

describe('lucky-reverseproxy with config', () => {
  beforeEach(() => {
    captureRequests();
    http.request = (opts, cb) => {
      requestLog.push({ protocol: 'http:', opts });
      const res = {
        statusCode: 200,
        statusMessage: 'OK',
        on: (event, handler) => {
          if (event === 'data') setImmediate(() => handler('{"ret":0,"ruleList":[]}'));
          if (event === 'end') setImmediate(() => handler());
        }
      };
      const req = { on: () => {}, write: () => {}, end: () => setImmediate(() => cb(res)) };
      return req;
    };
  });

  afterEach(() => restoreRequests());

  it('getReverseProxyRules passes config through to openTokenFetch', async () => {
    const instanceConfig = {
      apiBase: 'http://lucky-different.local:16601',
      openToken: 'instance-open-tok'
    };

    await getReverseProxyRules(instanceConfig);

    assert.equal(requestLog.length, 1);
    assert.equal(requestLog[0].opts.hostname, 'lucky-different.local');
    assert.ok(requestLog[0].opts.path.includes('openToken=instance-open-tok'));
  });

  it('getAllReverseProxies passes config through', async () => {
    const instanceConfig = {
      apiBase: 'http://lucky2.local:16601',
      openToken: 'tok2'
    };

    const proxies = await getAllReverseProxies(instanceConfig);

    assert.deepEqual(proxies, []);
    assert.equal(requestLog[0].opts.hostname, 'lucky2.local');
  });
});
