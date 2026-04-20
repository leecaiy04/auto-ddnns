import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { dashboardRoutes } from '../central-hub/routes/dashboard.mjs';

async function createServer(modules) {
  const app = express();
  app.use('/api/dashboard', dashboardRoutes(modules));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('GET /api/dashboard/overview returns actual lucky proxy count when available', async () => {
  const modules = {
    coordinator: {
      getOverview: () => ({ proxies: { lucky: 1, cloudflare: 2 }, devices: 3 })
    },
    luckyManager: {
      config: { enabled: true },
      getLuckyProxies: async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    }
  };

  const { server, baseUrl } = await createServer(modules);

  try {
    const response = await fetch(`${baseUrl}/api/dashboard/overview`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.proxies.lucky, 3);
    assert.equal(payload.proxies.luckyActual, 3);
    assert.equal(payload.proxies.cloudflare, 2);
  } finally {
    await closeServer(server);
  }
});

test('GET /api/dashboard/overview falls back quickly when lucky proxy lookup hangs', async () => {
  const modules = {
    routeOptions: {
      dashboardLuckyTimeoutMs: 60
    },
    coordinator: {
      getOverview: () => ({ proxies: { lucky: 2 }, devices: 3 })
    },
    luckyManager: {
      config: { enabled: true },
      getLuckyProxies: () => new Promise(() => {})
    }
  };

  const { server, baseUrl } = await createServer(modules);

  try {
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}/api/dashboard/overview`);
    const elapsed = Date.now() - startedAt;
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.ok(elapsed < 180, `expected timeout-protected response, got ${elapsed}ms`);
    assert.equal(payload.proxies.lucky, 2);
    assert.equal(payload.proxies.luckyActual, 2);
  } finally {
    await closeServer(server);
  }
});
