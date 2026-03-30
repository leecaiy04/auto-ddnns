import assert from 'node:assert/strict';
import test from 'node:test';

import { getNpmAuthConfig, getProxyHosts } from '../lib/api-clients/npm-api.mjs';

function createJwt(expOffsetSeconds = 3600) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expOffsetSeconds }))
    .toString('base64url');
  return `header.${payload}.signature`;
}

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

test('npm-api logs in with email and password when token is absent', async () => {
  const keys = ['NPM_API_BASE', 'NPM_API_TOKEN', 'NPM_API_EMAIL', 'NPM_API_PASSWORD'];
  const previousEnv = snapshotEnv(keys);
  const previousFetch = globalThis.fetch;
  const calls = [];
  const jwt = createJwt();

  try {
    process.env.NPM_API_BASE = 'http://npm-login.local';
    process.env.NPM_API_TOKEN = '';
    process.env.NPM_API_EMAIL = 'login@example.com';
    process.env.NPM_API_PASSWORD = 'secret';

    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, options });

      if (url === 'http://npm-login.local/api/tokens') {
        return new Response(JSON.stringify({ token: jwt }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (url === 'http://npm-login.local/api/nginx/proxy-hosts') {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const hosts = await getProxyHosts();

    assert.deepEqual(hosts, []);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'http://npm-login.local/api/tokens');
    assert.equal(calls[0].options.method, 'POST');
    assert.match(calls[0].options.body, /login@example.com/);
    assert.equal(calls[1].url, 'http://npm-login.local/api/nginx/proxy-hosts');
    assert.equal(calls[1].options.headers.Authorization, `Bearer ${jwt}`);
    assert.equal(getNpmAuthConfig().mode, 'password');
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});

test('npm-api prefers static token over login flow', async () => {
  const keys = ['NPM_API_BASE', 'NPM_API_TOKEN', 'NPM_API_EMAIL', 'NPM_API_PASSWORD'];
  const previousEnv = snapshotEnv(keys);
  const previousFetch = globalThis.fetch;
  const calls = [];

  try {
    process.env.NPM_API_BASE = 'http://npm-token.local';
    process.env.NPM_API_TOKEN = 'static-token';
    process.env.NPM_API_EMAIL = 'ignored@example.com';
    process.env.NPM_API_PASSWORD = 'ignored-secret';

    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, options });

      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const hosts = await getProxyHosts();

    assert.deepEqual(hosts, []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://npm-token.local/api/nginx/proxy-hosts');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer static-token');
    assert.equal(getNpmAuthConfig().mode, 'token');
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
  }
});
