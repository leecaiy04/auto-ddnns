import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

import { ServiceRegistry } from '../modules/service-registry/index.mjs';

const baseProxyDefaults = {
  protocol: 'https',
  domains: ['leecaiy.shop', '222869.xyz'],
  externalPorts: { lucky: 55000 },
  dns: {
    wildcardDomains: ['*.leecaiy.shop', '*.222869.xyz'],
    sslCertDomains: ['leecaiy.shop', '*.leecaiy.shop', '222869.xyz', '*.222869.xyz']
  },
  defaultProxyTemplate: 'https://{serviceId}.{domain}:{port}',
  defaultIpv6Template: '{lanProtocol}://[{ipv6}]:{lanPort}'
};

const baseDevices = {
  devices: [
    { id: '10', name: 'App Server', ipv4: '192.168.9.10', isKeyMachine: true },
    { id: '200', name: 'NAS', ipv4: '192.168.9.200', isKeyMachine: true }
  ]
};

const baseRegistry = {
  services: [
    {
      id: 'existing',
      name: 'Existing App',
      device: '10',
      internalPort: 8080,
      internalProtocol: 'http',
      enableProxy: true,
      proxyType: 'reverseproxy',
      enableTLS: false,
      proxyDomain: 'existing.leecaiy.shop',
      description: 'Existing service',
      lucky: {
        port: 55000,
        remark: 'Existing App',
        advancedConfig: ''
      },
      sunpanel: {
        group: '工具',
        icon: 'https://existing.leecaiy.shop/favicon.ico',
        lanUrl: 'http://192.168.9.10:8080'
      },
      advanced: {
        waf: false,
        ignoreTlsVerify: true,
        autoRedirect: true,
        useTargetHost: true,
        accessLog: true,
        securityPresets: true,
        authentication: {
          enabled: false,
          type: 'web'
        }
      }
    }
  ]
};

let proxyDefaultsData;
let devicesData;
let registryData;
let writes;
let originalReadFileSync;
let originalWriteFileSync;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function installFsMock() {
  proxyDefaultsData = clone(baseProxyDefaults);
  devicesData = clone(baseDevices);
  registryData = clone(baseRegistry);
  writes = [];

  originalReadFileSync = fs.readFileSync;
  originalWriteFileSync = fs.writeFileSync;

  fs.readFileSync = (filePath, encoding) => {
    const target = String(filePath);

    if (target.endsWith('proxy-defaults.json')) {
      return JSON.stringify(proxyDefaultsData);
    }
    if (target.endsWith('devices.json')) {
      return JSON.stringify(devicesData);
    }
    if (target.endsWith('services-registry.json')) {
      return JSON.stringify(registryData);
    }

    return originalReadFileSync(filePath, encoding);
  };

  fs.writeFileSync = (filePath, content) => {
    const target = String(filePath);
    const payload = String(content);
    writes.push({ filePath: target, content: payload });

    if (target.endsWith('proxy-defaults.json')) {
      proxyDefaultsData = JSON.parse(payload);
      return;
    }

    if (target.endsWith('services-registry.json')) {
      registryData = JSON.parse(payload);
      return;
    }

    return originalWriteFileSync(filePath, content);
  };
}

function restoreFsMock() {
  fs.readFileSync = originalReadFileSync;
  fs.writeFileSync = originalWriteFileSync;
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

function createRegistry(config = {}, initialState = {}) {
  const stateManager = createStateManager(initialState);
  const changelog = { append: () => {} };
  const registry = new ServiceRegistry({ enabled: true, ...config }, stateManager, changelog);
  return { registry, stateManager };
}

describe('service-registry', () => {
  beforeEach(() => {
    installFsMock();
  });

  afterEach(() => {
    restoreFsMock();
  });

  it('init loads proxy defaults, devices and registry, then initializes service state', async () => {
    const { registry, stateManager } = createRegistry();

    await registry.init();

    assert.equal(registry.getAllServices().length, 1);
    assert.equal(registry.getProxyDefaults().externalPorts.lucky, 55000);
    assert.equal(registry.getDeviceList().length, 2);
    assert.deepEqual(stateManager.state.services, {
      lastUpdate: null,
      totalServices: 0,
      proxiedServices: 0
    });
  });

  it('getAllowedDeviceIds prefers config, then state, then devices.json', async () => {
    const configured = createRegistry({ allowedDevices: [200, 10] });
    await configured.registry.init();
    assert.deepEqual(configured.registry.getAllowedDeviceIds(), ['200', '10']);

    const fromState = createRegistry({}, {
      devices: {
        devices: {
          '88': { ipv4: '192.168.9.88' },
          '99': { ipv4: '192.168.9.99' }
        }
      }
    });
    await fromState.registry.init();
    assert.deepEqual(fromState.registry.getAllowedDeviceIds(), ['88', '99']);

    const fromFile = createRegistry();
    await fromFile.registry.init();
    assert.deepEqual(fromFile.registry.getAllowedDeviceIds(), ['10', '200']);
  });

  it('validateService reports missing fields, invalid port, invalid device and unmanaged domain', async () => {
    const { registry } = createRegistry();
    await registry.init();

    const result = registry.validateService({
      id: '',
      name: '',
      device: '999',
      internalPort: '70000',
      proxyDomain: 'bad.example.com'
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.includes('缺少服务ID'));
    assert.ok(result.errors.includes('缺少服务名称'));
    assert.ok(result.errors.some((error) => error.includes('无效的设备ID: 999')));
    assert.ok(result.errors.includes('无效的端口号: 70000'));
    assert.ok(result.errors.includes('域名必须属于 leecaiy.shop: bad.example.com'));
    assert.deepEqual(result.allowedDeviceIds, ['10', '200']);
  });

  it('quickAddFromScan derives proxy config, icon and LAN URL', async () => {
    const { registry, stateManager } = createRegistry();
    await registry.init();

    const service = await registry.quickAddFromScan({
      deviceId: '10',
      port: 3000,
      name: 'My App',
      group: '开发工具',
      description: 'Scanned service'
    });

    assert.equal(service.id, 'my-app');
    assert.equal(service.proxyDomain, 'my-app.leecaiy.shop');
    assert.equal(service.internalProtocol, 'http');
    assert.equal(service.lucky.port, 55000);
    assert.equal(service.sunpanel.icon, 'https://my-app.leecaiy.shop/favicon.ico');
    assert.equal(service.sunpanel.lanUrl, 'http://192.168.9.10:3000');
    assert.equal(stateManager.state.services.totalServices, 2);
    assert.equal(stateManager.saves, 1);
    assert.ok(writes.some((entry) => entry.filePath.endsWith('services-registry.json')));
  });

  it('addService fills lucky, sunpanel and advanced defaults', async () => {
    const { registry, stateManager } = createRegistry();
    await registry.init();

    const service = await registry.addService({
      id: 'jellyfin',
      name: 'Jellyfin',
      device: '200',
      internalPort: 8096,
      description: 'Media server'
    });

    assert.equal(service.enableProxy, true);
    assert.equal(service.proxyType, 'reverseproxy');
    assert.equal(service.enableTLS, false);
    assert.equal(service.proxyDomain, 'jellyfin.leecaiy.shop');
    assert.equal(service.internalProtocol, 'http');
    assert.equal(service.lucky.port, 55000);
    assert.equal(service.lucky.remark, 'Jellyfin');
    assert.equal(service.sunpanel.group, '其他');
    assert.equal(service.sunpanel.icon, 'https://jellyfin.leecaiy.shop/favicon.ico');
    assert.equal(service.sunpanel.lanUrl, 'http://192.168.9.200:8096');
    assert.deepEqual(service.advanced, {
      waf: false,
      ignoreTlsVerify: true,
      autoRedirect: true,
      useTargetHost: true,
      accessLog: true,
      securityPresets: true,
      authentication: {
        enabled: false,
        type: 'web'
      }
    });
    assert.equal(stateManager.state.services.totalServices, 2);
  });

  it('updateService merges lucky and sunpanel fields while normalizing advanced config', async () => {
    const { registry } = createRegistry();
    await registry.init();

    const updated = await registry.updateService('existing', {
      lucky: {
        advancedConfig: 'set-header X-Test 1'
      },
      sunpanel: {
        group: '开发'
      },
      advanced: {
        authentication: {
          enabled: true,
          type: 'basic'
        }
      }
    });

    assert.equal(updated.lucky.port, 55000);
    assert.equal(updated.lucky.remark, 'Existing App');
    assert.equal(updated.lucky.advancedConfig, 'set-header X-Test 1');
    assert.equal(updated.sunpanel.group, '开发');
    assert.equal(updated.sunpanel.icon, 'https://existing.leecaiy.shop/favicon.ico');
    assert.equal(updated.sunpanel.lanUrl, 'http://192.168.9.10:8080');
    assert.deepEqual(updated.advanced, {
      waf: false,
      ignoreTlsVerify: true,
      autoRedirect: true,
      useTargetHost: true,
      accessLog: true,
      securityPresets: true,
      authentication: {
        enabled: true,
        type: 'basic'
      }
    });
  });

  it('prepareLuckyProxyConfig, prepareSunPanelCardConfig and buildIpv6DirectUrl derive expected outputs', async () => {
    const { registry } = createRegistry();
    await registry.init();
    registry.getServiceById('existing').enableTLS = true;

    const luckyConfig = registry.prepareLuckyProxyConfig('existing', '240e:390:9e3:d060::10');
    const cardConfig = registry.prepareSunPanelCardConfig('existing', {
      publicUrl: 'https://existing.leecaiy.shop',
      groupOnlyName: 'ops-group'
    });
    const directUrl = registry.buildIpv6DirectUrl('existing', '240e:390:9e3:d060::10');

    assert.deepEqual(luckyConfig, {
      port: 55000,
      name: 'proxy-existing',
      remark: 'Existing App',
      domain: 'existing.leecaiy.shop',
      target: 'https://[240e:390:9e3:d060::10]:8080',
      type: 'reverseproxy',
      tls: true,
      advancedConfig: ''
    });
    assert.deepEqual(cardConfig, {
      title: 'Existing App',
      url: 'https://existing.leecaiy.shop',
      onlyName: 'svc-existing',
      iconUrl: 'https://existing.leecaiy.shop/favicon.ico',
      lanUrl: 'http://192.168.9.10:8080',
      description: 'Existing service',
      itemGroupOnlyName: 'ops-group',
      isSaveIcon: false
    });
    assert.equal(directUrl, 'http://[240e:390:9e3:d060::10]:8080');
  });
});
