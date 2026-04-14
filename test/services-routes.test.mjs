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

test('POST /api/services/add returns 502 when lucky sync fails', async () => {
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

    assert.equal(response.status, 502);
    assert.equal(payload.success, false);
    assert.equal(payload.sync?.results?.lucky?.failed, 1);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('POST /api/services/quick-add returns 502 when lucky sync fails', async () => {
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

    assert.equal(response.status, 502);
    assert.equal(payload.success, false);
    assert.equal(payload.sync?.results?.lucky?.failed, 1);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
