import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ── mock lucky-ddns functions ──

let mockTaskList = [];
let mockCreated = [];
let mockDeleted = [];
let mockSynced = [];

function resetMocks() {
  mockTaskList = [];
  mockCreated = [];
  mockDeleted = [];
  mockSynced = [];
}

// Create mock functions that will be injected
const mockDDNSFunctions = {
  getDDNSTaskList: async () => ({ ret: 0, list: mockTaskList }),
  createDDNSTask: async (opts, config) => {
    mockCreated.push(opts);
    return { ret: 0, msg: 'ok' };
  },
  deleteDDNSTask: async (taskKey, config) => {
    mockDeleted.push(taskKey);
    return { ret: 0, msg: 'ok' };
  },
  manualSyncDDNS: async (taskKey, config) => {
    mockSynced.push(taskKey);
    return { ret: 0, msg: 'ok' };
  },
  getDDNSLogs: async (page, pageSize) => ({ ret: 0, logs: [] }),
  buildAliyunDNSCredentials: () => ({ name: 'alidns', id: 'test-ak', secret: 'test-sk', forceInterval: 3600 }),
  buildRecord: (subDomain, type) => ({
    type,
    fullDomainName: subDomain,
    remark: '',
    ttl: 0,
    bizName: 'web',
    ipv6Address: '{ipv6Addr}',
    disable: false
  })
};

// Patch the module by re-importing with mocks
import module from 'node:module';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

describe('LuckyManager DDNS reconciliation', () => {
  let LuckyManager;
  let stateManager;

  beforeEach(async () => {
    resetMocks();

    // We test the reconciliation logic by instantiating LuckyManager
    // and checking its methods work with mocked state
    const mod = await import('../modules/lucky-manager/index.mjs');
    LuckyManager = mod.LuckyManager;

    // Create a minimal state manager mock
    stateManager = {
      state: {
        lucky: {
          lastSync: null,
          proxies: {},
          syncStatus: {},
          ddnsTasks: [],
          ddnsLastReconcile: null
        }
      },
      save: async () => {},
      addHistory: () => {}
    };
  });

  it('buildDesiredDDNSTasks generates correct task list from config', () => {
    const manager = new LuckyManager(
      {
        apiBase: 'http://lucky:16601/666',
        openToken: 'tok',
        ddnsConfig: {
          enabled: true,
          devices: ['10', '200'],
          domains: ['leecaiy.shop', '222869.xyz']
        }
      },
      stateManager
    );

    const tasks = manager.buildDesiredDDNSTasks();

    assert.equal(tasks.length, 4); // 2 devices x 2 domains
    assert.deepEqual(tasks.map(t => t.taskName), [
      'ddns-10-v6-leecaiy.shop',
      'ddns-10-v6-222869.xyz',
      'ddns-200-v6-leecaiy.shop',
      'ddns-200-v6-222869.xyz'
    ]);
    assert.equal(tasks[0].fullDomainName, '10.v6.leecaiy.shop');
    assert.equal(tasks[3].fullDomainName, '200.v6.222869.xyz');
  });

  it('buildDesiredDDNSTasks returns empty when no devices configured', () => {
    const manager = new LuckyManager(
      { apiBase: 'http://lucky:16601/666', ddnsConfig: { enabled: true, devices: [], domains: ['a.com'] } },
      stateManager
    );

    const tasks = manager.buildDesiredDDNSTasks();
    assert.equal(tasks.length, 0);
  });

  it('getLuckyDDNSConfig returns apiBase and openToken', () => {
    const manager = new LuckyManager(
      { apiBase: 'http://lucky:16601/666', openToken: 'my-tok' },
      stateManager
    );

    const config = manager.getLuckyDDNSConfig();
    assert.equal(config.apiBase, 'http://lucky:16601/666');
    assert.equal(config.openToken, 'my-tok');
  });

  it('getStatus includes DDNS fields', async () => {
    const manager = new LuckyManager(
      { enabled: true, apiBase: 'http://l:16601/666', ddnsConfig: { enabled: true } },
      stateManager
    );
    await manager.init();

    stateManager.state.lucky.ddnsTasks = ['ddns-10-v6-leecaiy.shop'];
    stateManager.state.lucky.ddnsLastReconcile = '2026-04-23T00:00:00Z';

    const status = manager.getStatus();
    assert.deepEqual(status.ddnsTasks, ['ddns-10-v6-leecaiy.shop']);
    assert.equal(status.ddnsLastReconcile, '2026-04-23T00:00:00Z');
  });

  it('init initializes DDNS state fields', async () => {
    stateManager.state.lucky = {};
    const manager = new LuckyManager({}, stateManager);
    await manager.init();

    assert.ok(Array.isArray(stateManager.state.lucky.ddnsTasks));
    assert.equal(stateManager.state.lucky.ddnsTasks.length, 0);
  });

  it('init preserves existing DDNS state', async () => {
    stateManager.state.lucky = {
      ddnsTasks: ['existing-task'],
      ddnsLastReconcile: 'old-time'
    };
    const manager = new LuckyManager({}, stateManager);
    await manager.init();

    assert.deepEqual(stateManager.state.lucky.ddnsTasks, ['existing-task']);
  });
});

describe('lucky-ddns API functions', () => {
  it('buildRecord creates correct AAAA record', async () => {
    const { buildRecord } = await import('../modules/lucky-manager/lucky-ddns.mjs');
    const record = buildRecord('10.v6.leecaiy.shop', 'AAAA');

    assert.equal(record.type, 'AAAA');
    assert.equal(record.fullDomainName, '10.v6.leecaiy.shop');
    assert.equal(record.ipv6Address, '{ipv6Addr}');
  });

  it('buildRecord creates A record with ipv4Addr placeholder', async () => {
    const { buildRecord } = await import('../modules/lucky-manager/lucky-ddns.mjs');
    const record = buildRecord('nas.example.com', 'A');

    assert.equal(record.type, 'A');
    assert.equal(record.ipv6Address, '{ipv4Addr}');
  });

  it('buildAliyunDNSCredentials reads from env', async () => {
    const { buildAliyunDNSCredentials } = await import('../modules/lucky-manager/lucky-ddns.mjs');
    // Without env vars set, should return empty strings for id/secret
    const creds = buildAliyunDNSCredentials();
    assert.equal(creds.name, 'alidns');
    assert.equal(creds.forceInterval, 3600);
  });

  it('buildAliyunDNSCredentials accepts overrides', async () => {
    const { buildAliyunDNSCredentials } = await import('../modules/lucky-manager/lucky-ddns.mjs');
    const creds = buildAliyunDNSCredentials({ id: 'my-ak', secret: 'my-sk', forceInterval: 1800 });
    assert.equal(creds.id, 'my-ak');
    assert.equal(creds.secret, 'my-sk');
    assert.equal(creds.forceInterval, 1800);
  });
});
