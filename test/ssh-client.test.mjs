import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'ssh2';

import {
  executeSSHCommand,
  testSSHConnection,
  getIPv6Neighbors,
  getARPTable,
  buildDeviceAddressMap
} from '../modules/device-monitor/ssh-client.mjs';

let originalOn;
let originalConnect;
let originalShell;
let originalEnd;
let originalSetTimeout;
let originalClearTimeout;
let consoleLog;
let consoleError;
let originalConsole;
let timerHandles;
let timerId;
let scenario;

function installSSHScenario(nextScenario = {}) {
  scenario = {
    prompt: 'router>\n',
    commandResponses: {},
    errorOnConnect: null,
    shellError: null,
    initialChunks: [],
    ...nextScenario
  };

  originalOn = Client.prototype.on;
  originalConnect = Client.prototype.connect;
  originalShell = Client.prototype.shell;
  originalEnd = Client.prototype.end;
  originalSetTimeout = global.setTimeout;
  originalClearTimeout = global.clearTimeout;

  timerHandles = new Map();
  timerId = 0;

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
      if (scenario.errorOnConnect) {
        this.__handlers?.error?.(new Error(scenario.errorOnConnect));
      } else {
        this.__handlers?.ready?.();
      }
    }, 0);
    return this;
  };

  Client.prototype.shell = function(_options, cb) {
    if (scenario.shellError) {
      cb(new Error(scenario.shellError));
      return;
    }

    const stream = {
      _dataHandler: null,
      writes: [],
      on(event, handler) {
        if (event === 'data') {
          this._dataHandler = handler;
        }
        return this;
      },
      write(chunk) {
        const input = String(chunk);
        this.writes.push(input);
        const trimmed = input.trim();

        if (!trimmed) {
          if (scenario.newlineResponse) {
            originalSetTimeout(() => {
              stream._dataHandler?.(Buffer.from(scenario.newlineResponse));
            }, 0);
          }
          return;
        }

        const response = scenario.commandResponses[trimmed];
        if (response !== undefined) {
          const chunks = Array.isArray(response) ? response : [response];
          for (const chunkPart of chunks) {
            originalSetTimeout(() => {
              stream._dataHandler?.(Buffer.from(chunkPart));
            }, 0);
          }
        }
      }
    };

    cb(null, stream);

    const initialChunks = [scenario.prompt, ...scenario.initialChunks].filter(Boolean);
    for (const chunk of initialChunks) {
      originalSetTimeout(() => {
        stream._dataHandler?.(Buffer.from(chunk));
      }, 0);
    }
  };

  Client.prototype.end = function() {};
}

function restoreSSHScenario() {
  Client.prototype.on = originalOn;
  Client.prototype.connect = originalConnect;
  Client.prototype.shell = originalShell;
  Client.prototype.end = originalEnd;
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;

  for (const handle of timerHandles?.values() || []) {
    originalClearTimeout(handle);
  }
}

describe('ssh-client', () => {
  beforeEach(() => {
    consoleLog = [];
    consoleError = [];
    installSSHScenario();
    originalConsole = global.console;
    global.console = {
      ...originalConsole,
      log: (...args) => {
        consoleLog.push(args.map(String).join(' '));
      },
      error: (...args) => {
        consoleError.push(args.map(String).join(' '));
      }
    };
  });

  afterEach(() => {
    global.console = originalConsole;
    restoreSSHScenario();
  });

  it('executeSSHCommand rejects immediately when password is missing', async () => {
    await assert.rejects(
      () => executeSSHCommand('ip neigh', { password: '' }),
      { message: /SSH 密码未设置/ }
    );
  });

  it('executeSSHCommand returns filtered command output from shell session', async () => {
    restoreSSHScenario();
    installSSHScenario({
      commandResponses: {
        'echo "ok"': ['echo "ok"\n', 'ok\n', 'router>\n']
      }
    });

    const output = await executeSSHCommand('echo "ok"', {
      password: 'secret',
      username: 'root',
      host: '192.168.3.1'
    });

    assert.equal(output, 'ok');
  });

  it('testSSHConnection returns true on successful command execution', async () => {
    restoreSSHScenario();
    installSSHScenario({
      commandResponses: {
        'echo "ok"': ['ok\n']
      }
    });

    const success = await testSSHConnection({ password: 'secret' });

    assert.equal(success, true);
    assert.ok(consoleLog.some((line) => line.includes('SSH 连接测试成功')));
  });

  it('testSSHConnection returns false when SSH connection fails', async () => {
    restoreSSHScenario();
    installSSHScenario({ errorOnConnect: 'network down' });

    const success = await testSSHConnection({ password: 'secret' });

    assert.equal(success, false);
    assert.ok(consoleError.some((line) => line.includes('SSH 连接测试失败')));
  });

  it('getIPv6Neighbors parses IPv6 rows, normalizes MACs and filters invalid entries', async () => {
    restoreSSHScenario();
    installSSHScenario({
      commandResponses: {
        'ip -6 neigh': [
          '240e:390:9e3:d060::10 dev br0 lladdr AA-BB-CC-DD-EE-10 REACHABLE\n',
          '240e:390:9e3:d060::20 dev br0 lladdr aabb-ccdd-ee20 STALE\n',
          'fe80::1 dev br0 lladdr aa:bb:cc:dd:ee:30 REACHABLE\n',
          '240e:390:9e3:d060::ff dev br0 lladdr aa:bb:cc:dd:ee:ff FAILED\n'
        ]
      }
    });

    const neighbors = await getIPv6Neighbors({ password: 'secret' });

    assert.equal(neighbors.length, 2);
    assert.equal(neighbors[0].ipv6, '240e:390:9e3:d060::10');
    assert.equal(neighbors[0].mac, 'aa:bb:cc:dd:ee:10');
    assert.equal(neighbors[1].ipv6, '240e:390:9e3:d060::20');
    assert.equal(neighbors[1].mac, 'aa:bb:cc:dd:ee:20');
  });

  it('getARPTable parses LAN entries and filters zero MAC rows', async () => {
    restoreSSHScenario();
    installSSHScenario({
      commandResponses: {
        'ip neigh': [
          '192.168.3.10 dev br0 lladdr AA-BB-CC-DD-EE-10 REACHABLE\n',
          '192.168.3.20 dev br0 lladdr aabb-ccdd-ee20 STALE\n',
          '192.168.3.30 dev br0 lladdr 00:00:00:00:00:00 STALE\n',
          '10.0.0.1 dev br0 lladdr aa:bb:cc:dd:ee:40 REACHABLE\n'
        ]
      }
    });

    const arpEntries = await getARPTable({ password: 'secret' });

    assert.equal(arpEntries.length, 2);
    assert.deepEqual(arpEntries.map((entry) => ({ ip: entry.ip, mac: entry.mac })), [
      { ip: '192.168.3.10', mac: 'aa:bb:cc:dd:ee:10' },
      { ip: '192.168.3.20', mac: 'aa:bb:cc:dd:ee:20' }
    ]);
  });

  it('buildDeviceAddressMap joins ARP and IPv6 tables by normalized MAC', async () => {
    restoreSSHScenario();
    installSSHScenario({
      commandResponses: {
        'ip neigh': [
          '192.168.3.10 dev br0 lladdr aa:bb:cc:dd:ee:10 REACHABLE\n',
          '192.168.3.20 dev br0 lladdr aa-bb-cc-dd-ee-20 STALE\n'
        ],
        'ip -6 neigh': [
          '240e:390:9e3:d060::10 dev br0 lladdr aa-bb-cc-dd-ee-10 REACHABLE\n',
          '240e:390:9e3:d060::20 dev br0 lladdr aabb-ccdd-ee20 REACHABLE\n'
        ]
      }
    });

    const deviceMap = await buildDeviceAddressMap({ password: 'secret' });

    assert.deepEqual(Object.fromEntries(deviceMap), {
      '192.168.3.10': {
        ipv4: '192.168.3.10',
        mac: 'aa:bb:cc:dd:ee:10',
        ipv6: '240e:390:9e3:d060::10'
      },
      '192.168.3.20': {
        ipv4: '192.168.3.20',
        mac: 'aa:bb:cc:dd:ee:20',
        ipv6: '240e:390:9e3:d060::20'
      }
    });
  });
});
