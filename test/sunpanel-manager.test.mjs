import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { SunPanelManager } from '../modules/sunpanel-manager/index.mjs';

const ENV_KEYS = ['SUNPANEL_API_BASE', 'SUNPANEL_API_TOKEN'];

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

function installFetchMock(handler) {
  fetchCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    const call = {
      url: String(url),
      method: options.method || 'GET',
      headers: { ...(options.headers || {}) },
      body
    };
    fetchCalls.push(call);
    return handler(call);
  };
}

function createManager(config = {}, initialState = {}) {
  const stateManager = createStateManager(initialState);
  const manager = new SunPanelManager({
    enabled: true,
    apiBase: 'http://sunpanel.local/openapi/v1',
    apiToken: 'sun-token',
    ...config
  }, stateManager);
  return { manager, stateManager };
}

describe('sunpanel-manager', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    envSnapshot = snapshotEnv(ENV_KEYS);
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv(envSnapshot);
  });

  it('generateOnlyName and buildGroupOnlyName normalize identifiers', () => {
    const { manager } = createManager();

    assert.equal(manager.generateOnlyName('https://App.Example.com:8443/path'), 'app-example-com-8443-path');
    assert.equal(manager.buildGroupOnlyName('开发 工具'), '开发-工具');
    assert.equal(manager.buildGroupOnlyName(''), '其他');
  });

  it('buildPublicUrl omits default ports and keeps non-default ports', () => {
    const { manager } = createManager();

    assert.equal(manager.buildPublicUrl({ port: 443 }, 'app.example.com'), 'https://app.example.com');
    assert.equal(manager.buildPublicUrl({ port: 80, enableTLS: false }, 'app.example.com'), 'http://app.example.com');
    assert.equal(manager.buildPublicUrl({ port: 55000 }, 'app.example.com'), 'https://app.example.com:55000');
    assert.equal(manager.buildPublicUrl({ port: 8080, enableTLS: false }, 'app.example.com'), 'http://app.example.com:8080');
  });

  it('buildLanUrl replaces loopback and preserves path, query and hash', () => {
    const { manager } = createManager();

    assert.equal(
      manager.buildLanUrl('http://127.0.0.1:3000/admin?a=1#hash', '192.168.3.2'),
      'http://192.168.3.2:3000/admin?a=1#hash'
    );
    assert.equal(
      manager.buildLanUrl('https://localhost/app', '192.168.3.2'),
      'https://192.168.3.2/app'
    );
    assert.equal(
      manager.buildLanUrl('http://[::1]:16601/', '192.168.3.2'),
      'http://192.168.3.2:16601'
    );
    assert.equal(
      manager.buildLanUrl('not-a-url', '192.168.3.2'),
      'not-a-url'
    );
  });

  it('calculateSunPanelHash is stable for same input and changes with config', () => {
    const { manager } = createManager();
    const proxy = { port: 55000, enabled: true };
    const cardA = {
      title: 'App',
      url: 'https://app.example.com',
      lanUrl: 'http://192.168.3.10:3000',
      iconUrl: 'https://app.example.com/favicon.ico',
      itemGroupOnlyName: '其他'
    };

    const hash1 = manager.calculateSunPanelHash(proxy, cardA);
    const hash2 = manager.calculateSunPanelHash(proxy, cardA);
    const hash3 = manager.calculateSunPanelHash(proxy, {
      ...cardA,
      lanUrl: 'http://192.168.3.10:3001'
    });

    assert.equal(hash1, hash2);
    assert.notEqual(hash1, hash3);
  });

  it('syncToSunPanel creates default groups and creates a card when item is missing', async () => {
    installFetchMock((call) => {
      if (call.url.endsWith('/itemGroup/getList')) {
        return jsonResponse({
          code: 0,
          msg: 'success',
          data: { list: [], count: 0 }
        });
      }

      if (call.url.endsWith('/itemGroup/create')) {
        return jsonResponse({
          code: 0,
          msg: 'success',
          data: {
            itemGroupID: {
              'nas': 1,
              '服务器': 2,
              '其他': 3
            }[call.body.onlyName] || 99
          }
        });
      }

      if (call.url.endsWith('/item/getInfoByOnlyName')) {
        return jsonResponse({ code: 1203, msg: 'item not found', data: null });
      }

      if (call.url.endsWith('/item/create')) {
        return jsonResponse({ code: 0, msg: 'success', data: null });
      }

      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });

    const { manager, stateManager } = createManager();
    await manager.init();

    const result = await manager.syncToSunPanel([
      {
        id: 'app',
        name: 'App Service',
        description: 'Main app',
        proxyDomain: 'app.example.com',
        sunpanel: {
          group: '服务器',
          icon: 'https://app.example.com/icon.png',
          lanUrl: 'http://192.168.3.10:3000'
        }
      }
    ], [
      {
        port: 55000,
        enableTLS: true,
        enabled: true,
        remark: 'App Service',
        domains: ['app.example.com'],
        target: 'http://127.0.0.1:3000'
      }
    ], '192.168.3.2');

    assert.deepEqual(result, {
      success: 1,
      failed: 0,
      updated: 0,
      details: []
    });

    const createdGroups = fetchCalls
      .filter((call) => call.url.endsWith('/itemGroup/create'))
      .map((call) => call.body.onlyName);
    assert.deepEqual(createdGroups, ['nas', '服务器', '其他']);

    const createCardCall = fetchCalls.find((call) => call.url.endsWith('/item/create'));
    assert.deepEqual(createCardCall.body, {
      title: 'App Service',
      url: 'https://app.example.com:55000',
      onlyName: 'svc-app',
      iconUrl: 'https://app.example.com/icon.png',
      lanUrl: 'http://192.168.3.10:3000',
      description: 'Main app',
      itemGroupID: 2,
      itemGroupOnlyName: '服务器',
      isSaveIcon: false
    });

    const syncState = stateManager.state.sunpanel.syncStatus['svc-app_0'];
    assert.equal(syncState.domain, 'app.example.com');
    assert.equal(syncState.serviceId, 'app');
    assert.equal(syncState.groupOnlyName, '服务器');
    assert.equal(stateManager.saves, 1);
    assert.ok(stateManager.state.sunpanel.lastSync);
  });

  it('syncToSunPanel skips update when hash is unchanged', async () => {
    installFetchMock((call) => {
      if (call.url.endsWith('/itemGroup/getList')) {
        return jsonResponse({
          code: 0,
          msg: 'success',
          data: {
            list: [
              { itemGroupID: 3, onlyName: '其他', title: '其他' },
              { itemGroupID: 1, onlyName: 'nas', title: 'NAS' },
              { itemGroupID: 2, onlyName: '服务器', title: '服务器' }
            ],
            count: 3
          }
        });
      }

      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });

    const { manager, stateManager } = createManager({ enabled: true }, {
      sunpanel: {
        lastSync: null,
        cards: {},
        groups: {},
        syncStatus: {
          'svc-app_0': {
            hash: '',
            domain: 'app.example.com'
          }
        }
      }
    });
    await manager.init();

    const proxy = {
      port: 55000,
      enableTLS: true,
      enabled: true,
      remark: 'App Service',
      domains: ['app.example.com'],
      target: 'http://127.0.0.1:3000'
    };
    const services = [
      {
        id: 'app',
        name: 'App Service',
        description: 'Main app',
        proxyDomain: 'app.example.com',
        sunpanel: {
          group: '其他',
          icon: 'https://app.example.com/icon.png',
          lanUrl: 'http://192.168.3.10:3000'
        }
      }
    ];
    const cardConfig = {
      title: 'App Service',
      url: 'https://app.example.com:55000',
      onlyName: 'svc-app',
      iconUrl: 'https://app.example.com/icon.png',
      lanUrl: 'http://192.168.3.10:3000',
      description: 'Main app',
      itemGroupID: 3,
      itemGroupOnlyName: '其他',
      isSaveIcon: false
    };
    stateManager.state.sunpanel.syncStatus['svc-app_0'].hash = manager.calculateSunPanelHash(proxy, cardConfig);

    const result = await manager.syncToSunPanel(services, [proxy], '192.168.3.2');

    assert.deepEqual(result, {
      success: 0,
      failed: 0,
      updated: 0,
      details: [{ instance: 0, domain: 'app.example.com', action: 'skipped', reason: 'hash_unchanged' }]
    });
    assert.equal(fetchCalls.filter((call) => call.url.endsWith('/item/getInfoByOnlyName')).length, 0);
    assert.equal(fetchCalls.filter((call) => call.url.endsWith('/item/create')).length, 0);
    assert.equal(fetchCalls.filter((call) => call.url.endsWith('/item/update')).length, 0);
    assert.equal(stateManager.saves, 1);
  });

  it('syncToSunPanel updates an existing card and removes stale cards', async () => {
    installFetchMock((call) => {
      if (call.url.endsWith('/itemGroup/getList')) {
        return jsonResponse({
          code: 0,
          msg: 'success',
          data: {
            list: [
              { itemGroupID: 3, onlyName: '其他', title: '其他' },
              { itemGroupID: 1, onlyName: 'nas', title: 'NAS' },
              { itemGroupID: 2, onlyName: '服务器', title: '服务器' }
            ],
            count: 3
          }
        });
      }

      if (call.url.endsWith('/item/getInfoByOnlyName')) {
        return jsonResponse({ code: 0, msg: 'success', data: { title: 'Old App' } });
      }

      if (call.url.endsWith('/item/update')) {
        return jsonResponse({ code: 0, msg: 'success', data: null });
      }

      if (call.url.endsWith('/item/delete')) {
        return jsonResponse({ code: 0, msg: 'success', data: null });
      }

      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });

    const { manager, stateManager } = createManager({}, {
      sunpanel: {
        lastSync: null,
        cards: {},
        groups: {},
        syncStatus: {
          'stale-card_0': {
            domain: 'stale.example.com',
            remark: 'Stale Service',
            serviceId: 'stale'
          }
        }
      }
    });
    await manager.init();

    const result = await manager.syncToSunPanel([
      {
        id: 'app',
        name: 'App Service',
        description: 'Main app',
        proxyDomain: 'app.example.com',
        sunpanel: {
          group: '其他',
          icon: 'https://app.example.com/icon.png',
          lanUrl: 'http://192.168.3.10:3000'
        }
      }
    ], [
      {
        port: 55000,
        enableTLS: true,
        enabled: true,
        remark: 'App Service',
        domains: ['app.example.com'],
        target: 'http://127.0.0.1:3000'
      }
    ], '192.168.3.2');

    assert.deepEqual(result, {
      success: 2,
      failed: 0,
      updated: 1,
      details: []
    });

    const updateCall = fetchCalls.find((call) => call.url.endsWith('/item/update'));
    assert.equal(updateCall.body.onlyName, 'svc-app');
    assert.equal(updateCall.body.url, 'https://app.example.com:55000');

    const deleteCall = fetchCalls.find((call) => call.url.endsWith('/item/delete'));
    assert.deepEqual(deleteCall.body, { onlyName: 'stale-card' });
    assert.ok(stateManager.state.sunpanel.syncStatus['svc-app_0']);
    assert.equal(stateManager.state.sunpanel.syncStatus['stale-card_0'], undefined);
    assert.equal(stateManager.saves, 1);
  });

  it('syncToSunPanel retries create with icon fallbacks when SunPanel cannot save icon files', async () => {
    let createAttempts = 0;

    installFetchMock((call) => {
      if (call.url.endsWith('/itemGroup/getList')) {
        return jsonResponse({
          code: 0,
          msg: 'success',
          data: {
            list: [
              { itemGroupID: 3, onlyName: '其他', title: '其他' },
              { itemGroupID: 1, onlyName: 'nas', title: 'NAS' },
              { itemGroupID: 2, onlyName: '服务器', title: '服务器' }
            ],
            count: 3
          }
        });
      }

      if (call.url.endsWith('/item/getInfoByOnlyName')) {
        return jsonResponse({ code: 1203, msg: 'item not found', data: null });
      }

      if (call.url.endsWith('/item/create')) {
        createAttempts += 1;
        if (createAttempts <= 2) {
          return jsonResponse({ code: 5001, msg: 'failed to save icon file', data: null });
        }
        return jsonResponse({ code: 0, msg: 'success', data: null });
      }

      throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    });

    const { manager, stateManager } = createManager();
    await manager.init();

    const result = await manager.syncToSunPanel([], [
      {
        port: 55000,
        enableTLS: true,
        enabled: true,
        remark: 'Standalone Proxy',
        domains: ['standalone.example.com'],
        target: 'http://127.0.0.1:3000'
      }
    ], '192.168.3.2');

    assert.deepEqual(result, {
      success: 1,
      failed: 0,
      updated: 0,
      details: []
    });

    const createCalls = fetchCalls.filter((call) => call.url.endsWith('/item/create'));
    assert.equal(createCalls.length, 3);
    assert.equal(createCalls[0].body.isSaveIcon, true);
    assert.equal(createCalls[0].body.iconUrl, 'https://standalone.example.com/favicon.ico');
    assert.equal(createCalls[1].body.isSaveIcon, false);
    assert.equal(createCalls[1].body.iconUrl, 'https://standalone.example.com/favicon.ico');
    assert.equal(createCalls[2].body.isSaveIcon, false);
    assert.equal(createCalls[2].body.iconUrl, '');

    const syncState = stateManager.state.sunpanel.syncStatus['standalone-example-com_0'];
    assert.equal(syncState.domain, 'standalone.example.com');
    assert.equal(syncState.serviceId, null);
  });

  it('purgeSunPanel clears local sync state and preserves card summary in result', async () => {
    const { manager, stateManager } = createManager({}, {
      sunpanel: {
        lastSync: '2026-04-25T10:00:00Z',
        cards: {},
        groups: {},
        syncStatus: {
          'svc-app_0': {
            onlyName: 'svc-app',
            remark: 'App Service',
            domain: 'app.example.com',
            serviceId: 'app'
          },
          'svc-nas_0': {
            onlyName: 'svc-nas',
            remark: 'NAS',
            domain: 'nas.example.com',
            serviceId: 'nas'
          }
        }
      }
    });

    const result = await manager.purgeSunPanel();

    assert.equal(result.total, 2);
    assert.equal(result.cleared, 2);
    assert.equal(result.cards.length, 2);
    assert.equal(stateManager.saves, 1);
    assert.deepEqual(stateManager.state.sunpanel.syncStatus, {});
    assert.equal(stateManager.state.sunpanel.lastSync, null);
  });
});
