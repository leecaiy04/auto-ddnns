import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'ssh2';

import { DeviceMonitor } from '../modules/device-monitor/index.mjs';

const ENV_KEYS = ['ROUTER_PASSWORD', 'ROUTER_HOST', 'ROUTER_USERNAME'];

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

function createStateManager(initialState = {}) {
  return {
    saves: 0,
    state: JSON.parse(JSON.stringify(initialState)),
    async save() {
      this.saves += 1;
    }
  };
}

function installSSHMock({ arpOutput, ipv6Output }) {
  const originalOn = Client.prototype.on;
  const originalConnect = Client.prototype.connect;
  const originalShell = Client.prototype.shell;
  const originalEnd = Client.prototype.end;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timerHandles = new Map();
  let timerId = 0;

  global.setTimeout = (fn, ms = 0, ...args) => {
    const id = ++timerId;
    const delay = ms >= 20000 ? 25 : 0;
    const handle = originalSetTimeout(() => {
      timerHandles.delete(id);
      fn(...args);
    }, delay);
    timerHandles.set(id, handle);
    return id;
  };

  global.clearTimeout = (id) => {
    const handle = timerHandles.get(id);
    if (handle) {
      originalClearTimeout(handle);
      timerHandles.delete(id);
    }
  };

  Client.prototype.on = function(event, handler) {
    this.__handlers ??= {};
    this.__handlers[event] = handler;
    return this;
  };

  Client.prototype.connect = function() {
    originalSetTimeout(() => {
      this.__handlers?.ready?.();
    }, 0);
    return this;
  };

  Client.prototype.shell = function(_options, cb) {
    let sentArp = false;
    let sentIpv6 = false;

    const stream = {
      _dataHandler: null,
      on(event, handler) {
        if (event === 'data') {
          this._dataHandler = handler;
        }
        return this;
      },
      write(chunk) {
        const input = String(chunk).trim();

        if (input === 'ip neigh' && !sentArp) {
          sentArp = true;
          originalSetTimeout(() => {
            stream._dataHandler?.(Buffer.from(`${arpOutput}\n`));
          }, 0);
        }

        if (input === 'ip -6 neigh' && !sentIpv6) {
          sentIpv6 = true;
          originalSetTimeout(() => {
            stream._dataHandler?.(Buffer.from(`${ipv6Output}\n`));
          }, 0);
        }
      }
    };

    cb(null, stream);
    originalSetTimeout(() => {
      stream._dataHandler?.(Buffer.from('router>\n'));
    }, 0);
  };

  Client.prototype.end = function() {};

  return () => {
    Client.prototype.on = originalOn;
    Client.prototype.connect = originalConnect;
    Client.prototype.shell = originalShell;
    Client.prototype.end = originalEnd;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;

    for (const handle of timerHandles.values()) {
      originalClearTimeout(handle);
    }
  };
}

describe('device-monitor', () => {
  let envSnapshot;

  beforeEach(() => {
    envSnapshot = snapshotEnv(ENV_KEYS);
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  it('init initializes devices state when absent', async () => {
    delete process.env.ROUTER_PASSWORD;
    const stateManager = createStateManager({});
    const monitor = new DeviceMonitor({ enabled: true }, stateManager);

    await monitor.init();

    assert.deepEqual(stateManager.state.devices, {
      lastUpdate: null,
      devices: {},
      ipv6Map: {}
    });
  });

  it('checkDevices returns failure when router password is missing', async () => {
    delete process.env.ROUTER_PASSWORD;
    const stateManager = createStateManager({});
    const monitor = new DeviceMonitor({ enabled: true }, stateManager);

    const result = await monitor.checkDevices();

    assert.deepEqual(result, {
      success: false,
      message: '路由器密码未设置'
    });
  });

  it('getters and status read device information from state', () => {
    process.env.ROUTER_PASSWORD = 'secret';
    const stateManager = createStateManager({
      devices: {
        lastUpdate: '2026-04-23T00:00:00Z',
        totalDevices: 2,
        ipv6Ready: 1,
        ipv6Map: {
          '10': '240e:390:9e3:d060::10'
        },
        devices: {
          '10': {
            ipv4: '192.168.9.10',
            ipv6: '240e:390:9e3:d060::10',
            mac: 'aa:bb:cc:dd:ee:10'
          },
          '200': {
            ipv4: '192.168.9.200',
            ipv6: null,
            mac: 'aa:bb:cc:dd:ee:c8'
          }
        }
      }
    });
    const monitor = new DeviceMonitor({ enabled: true }, stateManager);

    assert.equal(monitor.getDeviceIPv6('10'), '240e:390:9e3:d060::10');
    assert.equal(monitor.getDeviceIPv6('200'), null);
    assert.deepEqual(monitor.getDeviceInfo('200'), {
      ipv4: '192.168.9.200',
      ipv6: null,
      mac: 'aa:bb:cc:dd:ee:c8'
    });
    assert.deepEqual(monitor.getAllDevices(), [
      {
        id: '10',
        ipv4: '192.168.9.10',
        ipv6: '240e:390:9e3:d060::10',
        mac: 'aa:bb:cc:dd:ee:10'
      },
      {
        id: '200',
        ipv4: '192.168.9.200',
        ipv6: null,
        mac: 'aa:bb:cc:dd:ee:c8'
      }
    ]);
    assert.deepEqual(monitor.getIPv6Map(), { '10': '240e:390:9e3:d060::10' });
    assert.deepEqual(monitor.getStatus(), {
      lastUpdate: '2026-04-23T00:00:00Z',
      totalDevices: 2,
      ipv6Ready: 1,
      enabled: true
    });
  });

  it('generatePortMappingTable builds v6 domains for ready devices', () => {
    process.env.ROUTER_PASSWORD = 'secret';
    const stateManager = createStateManager({
      devices: {
        devices: {
          '10': {
            ipv4: '192.168.9.10',
            ipv6: '240e:390:9e3:d060::10',
            mac: 'aa:bb:cc:dd:ee:10'
          },
          '200': {
            ipv4: '192.168.9.200',
            ipv6: null,
            mac: 'aa:bb:cc:dd:ee:c8'
          }
        },
        ipv6Map: {
          '10': '240e:390:9e3:d060::10'
        }
      }
    });
    const monitor = new DeviceMonitor({ enabled: true }, stateManager);

    const table = monitor.generatePortMappingTable();

    assert.equal(table.entries.length, 2);
    assert.deepEqual(table.entries[0], {
      deviceId: '10',
      ipv4: '192.168.9.10',
      ipv6: '240e:390:9e3:d060::10',
      mac: 'aa:bb:cc:dd:ee:10',
      domain: '10.v6.leecaiy.shop',
      ready: true
    });
    assert.deepEqual(table.entries[1], {
      deviceId: '200',
      ipv4: '192.168.9.200',
      ipv6: null,
      mac: 'aa:bb:cc:dd:ee:c8',
      domain: null,
      ready: false
    });
  });

  it('checkDevices updates state from SSH-derived ARP and IPv6 maps', async () => {
    process.env.ROUTER_PASSWORD = 'secret';
    const restoreSSH = installSSHMock({
      arpOutput: [
        '192.168.9.10 dev br0 lladdr aa:bb:cc:dd:ee:10 REACHABLE',
        '192.168.9.200 dev br0 lladdr aa-bb-cc-dd-ee-c8 STALE',
        '192.168.9.201 dev br0 lladdr 00:00:00:00:00:00 STALE'
      ].join('\n'),
      ipv6Output: [
        '240e:390:9e3:d060::10 dev br0 lladdr aa:bb:cc:dd:ee:10 REACHABLE',
        '240e:390:9e3:d060::200 dev br0 lladdr aa-bb-cc-dd-ee-c8 REACHABLE',
        'fe80::1 dev br0 lladdr aa:bb:cc:dd:ee:10 REACHABLE',
        '240e:390:9e3:d060::ffff dev br0 lladdr aa:bb:cc:dd:ee:ff FAILED'
      ].join('\n')
    });

    try {
      const stateManager = createStateManager({});
      const monitor = new DeviceMonitor({ enabled: true, router: { timeout: 25000 } }, stateManager);
      await monitor.init();

      const result = await monitor.checkDevices();

      assert.equal(result.success, true);
      assert.equal(result.totalDevices, 2);
      assert.equal(result.ipv6Ready, 2);
      assert.equal(stateManager.saves, 1);
      assert.equal(monitor.getDeviceIPv6('10'), '240e:390:9e3:d060::10');
      assert.equal(monitor.getDeviceIPv6('200'), '240e:390:9e3:d060::200');
      assert.equal(stateManager.state.devices.totalDevices, 2);
      assert.equal(stateManager.state.devices.ipv6Ready, 2);
      assert.equal(stateManager.state.devices.devices['10'].mac, 'aa:bb:cc:dd:ee:10');
      assert.equal(stateManager.state.devices.devices['200'].mac, 'aa:bb:cc:dd:ee:c8');
    } finally {
      restoreSSH();
    }
  });
});
