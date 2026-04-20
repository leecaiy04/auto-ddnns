import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import { serviceRoutes } from '../central-hub/routes/services.mjs';

async function createServer(modules) {
  const app = express();
  app.use(express.json());
  app.use('/api/services', serviceRoutes(modules));

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

async function withMockedFetch(mockFetch, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;

  try {
    return await fn(originalFetch);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('POST /api/services/add persists service and returns warning payload when lucky sync fails', async () => {
  const modules = {
    serviceRegistry: {
      validateService: () => ({ valid: true, errors: [] }),
      addService: async (service) => ({ id: service.id, ...service })
    },
    coordinator: {
      runLuckySync: async () => ({ success: 0, failed: 1 }),
      runSunpanelSync: async () => ({ success: 1, failed: 0 })
    }
  };

  const { server, baseUrl } = await createServer(modules);

  try {
    const response = await fetch(`${baseUrl}/api/services/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'demo',
        name: 'Demo',
        device: '10',
        internalPort: 8080,
        internalProtocol: 'http',
        proxyDomain: 'demo.222869.xyz'
      })
    });

    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.syncSuccess, false);
    assert.match(payload.warning, /服务已添加/);
    assert.equal(payload.service?.id, 'demo');
    assert.equal(payload.sync?.results?.lucky?.failed, 1);
  } finally {
    await closeServer(server);
  }
});

test('POST /api/services/quick-add persists service and returns warning payload when lucky sync fails', async () => {
  const modules = {
    serviceRegistry: {
      quickAddFromScan: async ({ id, name, deviceId, port }) => ({
        id,
        name,
        device: String(deviceId),
        internalPort: port,
        internalProtocol: 'http',
        proxyDomain: `${id}.222869.xyz`
      })
    },
    coordinator: {
      runLuckySync: async () => ({ success: 0, failed: 1 }),
      runSunpanelSync: async () => ({ success: 1, failed: 0 })
    }
  };

  const { server, baseUrl } = await createServer(modules);

  try {
    const response = await fetch(`${baseUrl}/api/services/quick-add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'demo2',
        name: 'Demo2',
        deviceId: '10',
        port: 8081
      })
    });

    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.syncSuccess, false);
    assert.match(payload.warning, /服务已注册/);
    assert.equal(payload.service?.id, 'demo2');
    assert.equal(payload.sync?.results?.lucky?.failed, 1);
  } finally {
    await closeServer(server);
  }
});

test('POST /api/services/quick-add uses id as name when display name is empty', async () => {
  let receivedPayload = null;
  const modules = {
    serviceRegistry: {
      quickAddFromScan: async (payload) => {
        receivedPayload = payload;
        return {
          id: payload.id,
          name: payload.name,
          device: String(payload.deviceId),
          internalPort: payload.port,
          internalProtocol: 'http',
          proxyDomain: `${payload.id}.222869.xyz`
        };
      }
    },
    coordinator: {
      runLuckySync: async () => ({ success: 1, failed: 0 }),
      runSunpanelSync: async () => ({ success: 1, failed: 0 })
    }
  };

  const { server, baseUrl } = await createServer(modules);

  try {
    const response = await fetch(`${baseUrl}/api/services/quick-add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'demo3',
        name: '   ',
        deviceId: '10',
        port: 8082
      })
    });

    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(receivedPayload?.id, 'demo3');
    assert.equal(receivedPayload?.name, 'demo3');
    assert.equal(payload.service?.name, 'demo3');
  } finally {
    await closeServer(server);
  }
});


test('GET /api/services/connectivity probes ipv4 and ipv6 concurrently and returns per-endpoint status', async () => {
  const modules = {
    routeOptions: {
      connectivityProbeTimeoutMs: 200
    },
    serviceRegistry: {
      getAllServices: () => [{
        id: 'demo',
        name: 'Demo',
        device: '10',
        proxyDomain: 'demo.222869.xyz'
      }],
      getProxyDefaults: () => ({ externalPorts: { lucky: 55000 } }),
      buildIpv6DirectUrl: (serviceId, ipv6) => `http://[${ipv6}]/${serviceId}`
    },
    deviceMonitor: {
      getIPv6Map: () => ({ '10': '240e:390:9ee:eb10::10' })
    }
  };

  const { server, baseUrl } = await createServer(modules);
  const callLog = [];

  try {
    await withMockedFetch((url) => new Promise((resolve) => {
      callLog.push({ url, startedAt: Date.now() });
      setTimeout(() => resolve({ status: 204 }), 80);
    }), async (originalFetch) => {
      const startedAt = Date.now();
      const response = await originalFetch(`${baseUrl}/api/services/connectivity`);
      const elapsed = Date.now() - startedAt;
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      assert.equal(payload.services.length, 1);
      assert.equal(callLog.length, 2);
      assert.ok(elapsed < 170, `expected concurrent probes, got ${elapsed}ms`);
      assert.equal(payload.services[0].ipv4Proxy.ok, true);
      assert.equal(payload.services[0].ipv6Direct.ok, true);
      assert.match(payload.services[0].ipv4Proxy.url, /^https:\/\/demo\.222869\.xyz:55000$/);
      assert.match(payload.services[0].ipv6Direct.url, /^http:\/\/\[240e:390:9ee:eb10::10\]\/demo$/);
    });
  } finally {
    await closeServer(server);
  }
});

test('POST /api/services/quick-add forwards optional ipv6 payload to registry', async () => {
  let receivedPayload = null;
  const modules = {
    serviceRegistry: {
      quickAddFromScan: async (payload) => {
        receivedPayload = payload;
        return {
          id: payload.id,
          name: payload.name,
          device: String(payload.deviceId),
          ipv6: payload.ipv6,
          internalPort: payload.port,
          internalProtocol: 'http',
          proxyDomain: `${payload.id}.222869.xyz`
        };
      }
    },
    coordinator: {
      runLuckySync: async () => ({ success: 1, failed: 0 }),
      runSunpanelSync: async () => ({ success: 1, failed: 0 })
    }
  };

  const { server, baseUrl } = await createServer(modules);

  try {
    const response = await fetch(`${baseUrl}/api/services/quick-add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'demo4',
        name: 'Demo4',
        deviceId: '10',
        port: 8083,
        ipv6: '240e:390:9ee:eb10::10'
      })
    });

    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(receivedPayload?.ipv6, '240e:390:9ee:eb10::10');
    assert.equal(payload.service?.ipv6, '240e:390:9ee:eb10::10');
  } finally {
    await closeServer(server);
  }
});


test('GET /api/services/connectivity aborts hung probes and reports timeout errors', async () => {
  const modules = {
    routeOptions: {
      connectivityProbeTimeoutMs: 60
    },
    serviceRegistry: {
      getAllServices: () => [{
        id: 'demo',
        name: 'Demo',
        device: '10',
        proxyDomain: 'demo.222869.xyz'
      }],
      getProxyDefaults: () => ({ externalPorts: { lucky: 55000 } }),
      buildIpv6DirectUrl: (serviceId, ipv6) => `http://[${ipv6}]/${serviceId}`
    },
    deviceMonitor: {
      getIPv6Map: () => ({ '10': '240e:390:9ee:eb10::10' })
    }
  };

  const { server, baseUrl } = await createServer(modules);

  try {
    await withMockedFetch((url, options = {}) => new Promise((_, reject) => {
      const abort = () => reject(Object.assign(new Error(`aborted:${url}`), { name: 'AbortError' }));
      if (options.signal?.aborted) {
        abort();
        return;
      }
      options.signal?.addEventListener('abort', abort, { once: true });
    }), async (originalFetch) => {
      const startedAt = Date.now();
      const response = await originalFetch(`${baseUrl}/api/services/connectivity`);
      const elapsed = Date.now() - startedAt;
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.ok(elapsed < 220, `expected timeout-protected response, got ${elapsed}ms`);
      assert.equal(payload.services[0].ipv4Proxy.ok, false);
      assert.equal(payload.services[0].ipv6Direct.ok, false);
      assert.equal(payload.services[0].ipv4Proxy.error, 'timeout');
      assert.equal(payload.services[0].ipv6Direct.error, 'timeout');
    });
  } finally {
    await closeServer(server);
  }
});

test('GET /api/services/connectivity falls back to registry device ipv6 when monitor map is empty', async () => {
  const modules = {
    routeOptions: {
      connectivityProbeTimeoutMs: 200
    },
    serviceRegistry: {
      getAllServices: () => [{
        id: 'demo',
        name: 'Demo',
        device: '10',
        proxyDomain: 'demo.222869.xyz'
      }],
      getProxyDefaults: () => ({ externalPorts: { lucky: 55000 } }),
      buildIpv6DirectUrl: (serviceId, ipv6) => `http://[${ipv6}]/${serviceId}`,
      getDeviceById: () => ({ id: '10', ipv6: '240e:390:9ee:eb10::10' })
    },
    deviceMonitor: {
      getIPv6Map: () => ({})
    }
  };

  const { server, baseUrl } = await createServer(modules);

  try {
    await withMockedFetch(() => Promise.resolve({ status: 204 }), async (originalFetch) => {
      const response = await originalFetch(`${baseUrl}/api/services/connectivity`);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      assert.equal(payload.services.length, 1);
      assert.equal(payload.services[0].ipv6Direct.ok, true);
      assert.match(payload.services[0].ipv6Direct.url, /^http:\/\/\[240e:390:9ee:eb10::10\]\/demo$/);
    });
  } finally {
    await closeServer(server);
  }
});

test('GET /api/services/connectivity prefers ddns domain channel when available', async () => {
  const modules = {
    config: {
      modules: {
        ddns: {
          domains: {
            ipv6: ['10.v6.example.com']
          }
        }
      }
    },
    routeOptions: {
      connectivityProbeTimeoutMs: 200
    },
    serviceRegistry: {
      getAllServices: () => [{
        id: 'demo',
        name: 'Demo',
        device: '10',
        internalPort: 8080,
        internalProtocol: 'http',
        proxyDomain: 'demo.222869.xyz'
      }],
      getProxyDefaults: () => ({ externalPorts: { lucky: 55000 } }),
      buildIpv6DirectUrl: (serviceId, ipv6) => `http://[${ipv6}]/${serviceId}`
    },
    deviceMonitor: {
      getIPv6Map: () => ({ '10': '240e:390:9ee:eb10::10' })
    }
  };

  const { server, baseUrl } = await createServer(modules);

  try {
    await withMockedFetch((url) => {
      if (String(url).includes('10.v6.example.com')) {
        return Promise.resolve({ status: 204 });
      }
      return Promise.resolve({ status: 503 });
    }, async (originalFetch) => {
      const response = await originalFetch(`${baseUrl}/api/services/connectivity`);
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      assert.equal(payload.services.length, 1);
      assert.equal(payload.services[0].ipv6Direct.ok, true);
      assert.equal(payload.services[0].ipv6Direct.source, 'domain');
      assert.match(payload.services[0].ipv6Direct.url, /^http:\/\/10\.v6\.example\.com:8080$/);
    });
  } finally {
    await closeServer(server);
  }
});

test('PUT /api/services/proxy-defaults runs ddns, sync and certificate ensure with warning on partial failure', async () => {
  const modules = {
    serviceRegistry: {
      updateProxyDefaults: async (payload) => payload
    },
    coordinator: {
      runDDNS: async () => ({ success: true, failed: 0 }),
      runLuckySync: async () => ({ success: true, failed: 0 }),
      runSunpanelSync: async () => ({ success: true, failed: 0 })
    },
    luckyManager: {
      ensureManagedDomainCertificates: async () => ({ success: 0, failed: 1, skipped: 0 })
    }
  };

  const { server, baseUrl } = await createServer(modules);

  try {
    const response = await fetch(`${baseUrl}/api/services/proxy-defaults`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        protocol: 'https',
        domains: ['example.com'],
        dns: { sslCertDomains: ['example.com'] }
      })
    });

    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.syncSuccess, false);
    assert.match(payload.warning, /全局反代配置已保存/);
    assert.equal(payload.sync?.results?.ddns?.success, true);
    assert.equal(payload.sync?.results?.services?.success, true);
    assert.equal(payload.sync?.results?.certificates?.failed, 1);
    assert.deepEqual(payload.defaults?.domains, ['example.com']);
  } finally {
    await closeServer(server);
  }
});
