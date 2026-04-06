/**
 * 服务清单管理模块 v2.0
 * 白名单制：通过端口扫描发现 → 手动确认 → 自动生成反代配置
 * 所有变更记录到 changelog
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEnv } from '../../lib/utils/env-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, '..', '..', 'config', 'services-registry.json');
const PROXY_DEFAULTS_PATH = path.resolve(__dirname, '..', '..', 'config', 'proxy-defaults.json');
const DEVICES_PATH = path.resolve(__dirname, '..', '..', 'config', 'devices.json');

const MANAGED_DOMAIN = getEnv('ALIYUN_DOMAIN', '222869.xyz');
const MANAGED_DOMAINS = `${MANAGED_DOMAIN}`
  .split(',')
  .map(domain => domain.trim())
  .filter(Boolean);
const PRIMARY_MANAGED_DOMAIN = MANAGED_DOMAINS[0] || '222869.xyz';

// ==================== 工具函数 ====================

function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function buildManagedDomain(domainPrefix) {
  return `${domainPrefix}.${PRIMARY_MANAGED_DOMAIN}`;
}

function normalizeServiceDomains(service) {
  if (!service?.domainPrefix) {
    return service;
  }

  const proxyDomain = buildManagedDomain(service.domainPrefix);
  return {
    ...service,
    proxyDomain,
    sunpanel: {
      ...service.sunpanel,
      icon: service.sunpanel?.icon || `https://${proxyDomain}/favicon.ico`
    }
  };
}

function denormalizeServiceDomains(service) {
  if (!service?.domainPrefix) {
    return service;
  }
  const normalized = normalizeServiceDomains(service);
  return {
    ...service,
    proxyDomain: normalized.proxyDomain,
    sunpanel: normalized.sunpanel
  };
}

function inferInternalProtocol(port) {
  const securePorts = [443, 5001, 8006, 8443, 9443];
  return securePorts.includes(port) ? 'https' : 'http';
}

function buildDefaultLanUrl(service) {
  const protocol = inferInternalProtocol(service.internalPort);
  return `${protocol}://192.168.3.${service.device}:${service.internalPort}`;
}

function formatTargetHost(targetHost) {
  return targetHost?.includes(':') ? `[${targetHost}]` : targetHost;
}

function isManagedDomain(domain) {
  return MANAGED_DOMAINS.some(managedDomain => domain === managedDomain || domain.endsWith(`.${managedDomain}`));
}


function buildIpv6Hostname(ipv4, domain = MANAGED_DOMAIN) {
  const lastOctet = `${ipv4 || ''}`.trim().split('.').pop();
  if (!lastOctet || !/^\d+$/.test(lastOctet)) {
    return null;
  }
  return `${lastOctet}.v6.${domain}`;
}

function sanitizeId(id) {
  return `${id || ''}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ==================== 主类 ====================

export class ServiceRegistry {
  constructor(config, stateManager, changelogManager = null) {
    this.config = config;
    this.stateManager = stateManager;
    this.changelog = changelogManager;
    this.registryPath = REGISTRY_PATH;
    this.services = [];
    this.proxyDefaults = null;
    this.devices = [];
  }

  // ==================== 初始化 ====================

  async init() {
    this.loadProxyDefaults();
    this.loadDevices();
    await this.loadRegistry();

    if (!this.stateManager.state.services) {
      this.stateManager.state.services = {
        lastUpdate: null,
        totalServices: 0,
        proxiedServices: 0
      };
    }

    console.log(`[ServiceRegistry] ✅ 服务清单管理模块初始化完成，共加载 ${this.services.length} 个服务`);
  }

  loadProxyDefaults() {
    this.proxyDefaults = loadJSON(PROXY_DEFAULTS_PATH) || {
      protocol: 'https',
      domains: [MANAGED_DOMAIN],
      externalPorts: { lucky: 50000 },
      dns: { wildcardDomains: [`*.${MANAGED_DOMAIN}`], sslCertDomains: [MANAGED_DOMAIN, `*.${MANAGED_DOMAIN}`] },
      defaultProxyTemplate: 'https://{serviceId}.{domain}:{port}',
      defaultIpv6Template: '{lanProtocol}://[{ipv6}]:{lanPort}'
    };
  }

  loadDevices() {
    const data = loadJSON(DEVICES_PATH);
    this.devices = data?.devices || [];
  }

  getProxyDefaults() {
    return this.proxyDefaults;
  }

  async updateProxyDefaults(updates = {}) {
    this.proxyDefaults = {
      ...this.proxyDefaults,
      ...updates,
      externalPorts: {
        ...(this.proxyDefaults?.externalPorts || {}),
        ...(updates.externalPorts || {})
      },
      dns: {
        ...(this.proxyDefaults?.dns || {}),
        ...(updates.dns || {})
      }
    };

    fs.writeFileSync(PROXY_DEFAULTS_PATH, JSON.stringify(this.proxyDefaults, null, 2));
    await this.updateState();
    return this.proxyDefaults;
  }

  getManagedDomain() {
    return this.proxyDefaults?.domains?.[0] || MANAGED_DOMAIN;
  }

  getWildcardDomain() {
    return `*.${this.getManagedDomain()}`;
  }

  getDeviceDdnsHostname(deviceId) {
    const device = this.getDeviceById(deviceId);
    return buildIpv6Hostname(device?.ipv4, this.getManagedDomain());
  }

  getKeyMachinesWithDomains() {
    return this.getKeyMachines().map(machine => ({
      ...machine,
      ddnsHostname: this.getDeviceDdnsHostname(machine.id)
    }));
  }

  exportInventory() {
    const inventory = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      metadata: {
        managedDomain: this.getManagedDomain(),
        wildcardDomain: this.getWildcardDomain()
      },
      services: this.services.map(denormalizeServiceDomains),
      proxyDefaults: this.proxyDefaults,
      keyMachines: this.getKeyMachines(),
      devices: this.devices
    };

    this.stateManager.state.services = {
      ...(this.stateManager.state.services || {}),
      lastExport: {
        timestamp: inventory.exportedAt,
        counts: {
          services: inventory.services.length,
          keyMachines: inventory.keyMachines.length,
          devices: inventory.devices.length
        }
      }
    };

    return inventory;
  }

  previewImportInventory(payload = {}, mode = 'merge') {
    const services = Array.isArray(payload.services) ? payload.services : [];
    const incomingIds = services.map(service => sanitizeId(service.id)).filter(Boolean);
    const existingIds = new Set(this.services.map(service => service.id));
    const duplicateIds = incomingIds.filter((id, index) => incomingIds.indexOf(id) !== index);
    const updates = incomingIds.filter(id => existingIds.has(id));
    const additions = incomingIds.filter(id => !existingIds.has(id));
    const validationErrors = [];

    for (const service of services) {
      const normalizedService = {
        ...service,
        id: sanitizeId(service.id)
      };
      const validation = this.validateService(normalizedService);
      if (!validation.valid) {
        validationErrors.push({ id: normalizedService.id || null, errors: validation.errors });
      }
    }

    return {
      mode,
      counts: {
        incoming: services.length,
        additions: additions.length,
        updates: updates.length,
        duplicates: duplicateIds.length,
        validationErrors: validationErrors.length
      },
      duplicateIds,
      validationErrors,
      additions,
      updates,
      willReplaceExisting: mode === 'replace'
    };
  }

  async importInventory(payload = {}, options = {}) {
    const mode = options.mode === 'replace' ? 'replace' : 'merge';
    const preview = this.previewImportInventory(payload, mode);

    if (preview.duplicateIds.length > 0 || preview.validationErrors.length > 0) {
      return {
        success: false,
        preview,
        error: '导入清单校验失败'
      };
    }

    const incomingServices = (Array.isArray(payload.services) ? payload.services : [])
      .map(service => normalizeServiceDomains({ ...service, id: sanitizeId(service.id) }));

    let nextServices = [...this.services];
    if (mode === 'replace') {
      nextServices = incomingServices;
    } else {
      const nextById = new Map(this.services.map(service => [service.id, service]));
      for (const service of incomingServices) {
        nextById.set(service.id, service);
      }
      nextServices = Array.from(nextById.values());
    }

    this.services = nextServices;

    if (payload.proxyDefaults && typeof payload.proxyDefaults === 'object') {
      this.proxyDefaults = {
        ...this.proxyDefaults,
        ...payload.proxyDefaults,
        externalPorts: {
          ...(this.proxyDefaults?.externalPorts || {}),
          ...(payload.proxyDefaults.externalPorts || {})
        },
        dns: {
          ...(this.proxyDefaults?.dns || {}),
          ...(payload.proxyDefaults.dns || {})
        }
      };
      fs.writeFileSync(PROXY_DEFAULTS_PATH, JSON.stringify(this.proxyDefaults, null, 2));
    }

    if (Array.isArray(payload.devices)) {
      this.devices = payload.devices;
      fs.writeFileSync(DEVICES_PATH, JSON.stringify({ devices: this.devices }, null, 2));
    }

    await this.saveRegistry();
    this.stateManager.state.services = {
      ...(this.stateManager.state.services || {}),
      lastImport: {
        timestamp: new Date().toISOString(),
        mode,
        counts: preview.counts
      }
    };
    await this.updateState();

    return {
      success: true,
      preview,
      inventory: this.exportInventory()
    };
  }


  // ==================== 加载/保存 ====================

  async loadRegistry() {
    try {
      const content = fs.readFileSync(this.registryPath, 'utf-8');
      const data = JSON.parse(content);
      this.services = (data.services || []).map(normalizeServiceDomains);
    } catch (error) {
      console.error('[ServiceRegistry] ❌ 加载服务清单失败:', error.message);
      this.services = [];
    }
  }

  async saveRegistry() {
    try {
      const data = { services: this.services.map(denormalizeServiceDomains) };
      fs.writeFileSync(this.registryPath, JSON.stringify(data, null, 2));
      console.log('[ServiceRegistry] ✅ 服务清单已保存');
    } catch (error) {
      console.error('[ServiceRegistry] ❌ 保存服务清单失败:', error.message);
      throw error;
    }
  }

  // ==================== 服务 CRUD ====================

  getAllServices() {
    return this.services;
  }

  getProxiedServices() {
    return this.services.filter(s => s.enableProxy);
  }

  getServiceById(id) {
    return this.services.find(s => s.id === id) || null;
  }

  getServicesByDevice(device) {
    return this.services.filter(s => s.device === device);
  }

  getServiceByDomain(domain) {
    return this.services.find(s => s.proxyDomain === domain) || null;
  }

  /**
   * 从端口扫描结果快速添加服务
   * @param {object} params
   * @param {string} params.deviceId - 设备ID
   * @param {number} params.port - 端口号
   * @param {string} params.name - 服务名称
   * @param {string} params.id - 服务ID (英文，kebab-case)
   * @param {string} [params.group] - 分组
   * @param {string} [params.description] - 描述
   */
  async quickAddFromScan(params) {
    const { deviceId, port, name, id, group, description } = params;
    const serviceId = sanitizeId(id || name);
    const device = this.getDeviceById(deviceId);

    if (!device) {
      throw new Error(`设备 ${deviceId} 不存在`);
    }
    if (this.services.some(s => s.id === serviceId)) {
      throw new Error(`服务ID ${serviceId} 已存在`);
    }

    const internalProtocol = inferInternalProtocol(port);
    const primaryDomain = this.proxyDefaults?.domains?.[0] || MANAGED_DOMAIN;
    const proxyDomain = `${serviceId}.${primaryDomain}`;
    const luckyPort = this.proxyDefaults?.externalPorts?.lucky || 50000;

    const service = {
      id: serviceId,
      name: name,
      device: deviceId,
      internalPort: port,
      internalProtocol: internalProtocol,
      enableProxy: true,
      proxyType: 'reverseproxy',
      enableTLS: internalProtocol === 'https',
      proxyDomain: proxyDomain,
      description: description || `${name} on ${device.name}`,
      lucky: {
        port: luckyPort,
        remark: name,
        advancedConfig: ''
      },
      sunpanel: {
        group: group || '其他',
        icon: `https://${proxyDomain}/favicon.ico`,
        lanUrl: `${internalProtocol}://${device.ipv4}:${port}`
      }
    };

    this.services.push(service);
    await this.saveRegistry();
    await this.updateState();

    this.changelog?.append('add_service', serviceId, `从端口扫描快速添加: ${name} (${device.name}:${port})`, { service });
    console.log(`[ServiceRegistry] ✅ 快速添加服务: ${name} (${serviceId})`);
    return service;
  }

  /**
   * 添加新服务（完整模式）
   */
  async addService(service) {
    const serviceId = sanitizeId(service.id);
    if (this.services.some(s => s.id === serviceId)) {
      throw new Error(`服务ID ${serviceId} 已存在`);
    }

    const normalizedInput = normalizeServiceDomains(service);

    const advanced = service.advanced || {};
    const normalizedAdvanced = {
      waf: Boolean(advanced.waf || false),
      ignoreTlsVerify: advanced.ignoreTlsVerify !== undefined ? Boolean(advanced.ignoreTlsVerify) : true,
      autoRedirect: advanced.autoRedirect !== undefined ? Boolean(advanced.autoRedirect) : true,
      useTargetHost: advanced.useTargetHost !== undefined ? Boolean(advanced.useTargetHost) : true,
      accessLog: advanced.accessLog !== undefined ? Boolean(advanced.accessLog) : true,
      securityPresets: advanced.securityPresets !== undefined ? Boolean(advanced.securityPresets) : true,
      authentication: {
        enabled: Boolean(advanced.authentication?.enabled || false),
        type: advanced.authentication?.type || 'web'
      }
    };

    const primaryDomain = this.proxyDefaults?.domains?.[0] || MANAGED_DOMAIN;
    const luckyPort = this.proxyDefaults?.externalPorts?.lucky || 50000;

    const newService = {
      enableProxy: true,
      proxyType: 'reverseproxy',
      enableTLS: false,
      ...normalizedInput,
      id: serviceId,
      proxyDomain: normalizedInput.proxyDomain || `${serviceId}.${primaryDomain}`,
      internalProtocol: normalizedInput.internalProtocol || inferInternalProtocol(normalizedInput.internalPort),
      lucky: {
        port: luckyPort,
        remark: normalizedInput.name,
        advancedConfig: '',
        ...normalizedInput.lucky
      },
      sunpanel: {
        group: '其他',
        icon: `https://${normalizedInput.proxyDomain || `${serviceId}.${primaryDomain}`}/favicon.ico`,
        lanUrl: buildDefaultLanUrl(normalizedInput),
        ...normalizedInput.sunpanel
      },
      advanced: normalizedAdvanced
    };

    this.services.push(newService);
    await this.saveRegistry();
    await this.updateState();

    this.changelog?.append('add_service', serviceId, `手动添加服务: ${newService.name}`, { service: newService });
    console.log(`[ServiceRegistry] ✅ 服务已添加: ${newService.name} (${newService.id})`);
    return newService;
  }

  /**
   * 更新服务
   */
  async updateService(id, updates) {
    const index = this.services.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error(`服务ID ${id} 不存在`);
    }

    const existingService = this.services[index];
    const advanced = updates.advanced || existingService.advanced || {};
    const normalizedAdvanced = {
      waf: Boolean(advanced.waf || false),
      ignoreTlsVerify: advanced.ignoreTlsVerify !== undefined ? Boolean(advanced.ignoreTlsVerify) : true,
      autoRedirect: advanced.autoRedirect !== undefined ? Boolean(advanced.autoRedirect) : true,
      useTargetHost: advanced.useTargetHost !== undefined ? Boolean(advanced.useTargetHost) : true,
      accessLog: advanced.accessLog !== undefined ? Boolean(advanced.accessLog) : true,
      securityPresets: advanced.securityPresets !== undefined ? Boolean(advanced.securityPresets) : true,
      authentication: {
        enabled: Boolean(advanced.authentication?.enabled || false),
        type: advanced.authentication?.type || 'web'
      }
    };

    const before = { ...existingService };
    this.services[index] = normalizeServiceDomains({
      ...existingService,
      ...updates,
      lucky: { ...existingService.lucky, ...updates.lucky },
      sunpanel: { ...existingService.sunpanel, ...updates.sunpanel },
      advanced: normalizedAdvanced
    });

    await this.saveRegistry();
    await this.updateState();

    this.changelog?.append('update_service', id, `更新服务: ${this.services[index].name}`, { before, after: this.services[index] });
    console.log(`[ServiceRegistry] ✅ 服务已更新: ${this.services[index].name} (${id})`);
    return this.services[index];
  }

  /**
   * 删除服务
   */
  async deleteService(id) {
    const index = this.services.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error(`服务ID ${id} 不存在`);
    }

    const removed = this.services.splice(index, 1)[0];
    await this.saveRegistry();
    await this.updateState();

    this.changelog?.append('delete_service', id, `删除服务: ${removed.name}`, { service: removed });
    console.log(`[ServiceRegistry] ✅ 服务已删除: ${removed.name} (${id})`);
  }

  /**
   * 清空所有服务
   */
  async clearAll() {
    console.warn('[ServiceRegistry] ⚠️ 执行危险操作：清空所有服务！');
    const count = this.services.length;
    this.services = [];
    this.stateManager.state.services.totalServices = 0;
    this.stateManager.state.services.proxiedServices = 0;
    this.stateManager.state.services.lastUpdate = new Date().toISOString();
    await this.saveRegistry();

    this.changelog?.append('clear_all_services', 'services-registry', `清空所有服务 (共 ${count} 个)`);
    return true;
  }

  // ==================== 状态 ====================

  async updateState() {
    this.stateManager.state.services = {
      ...(this.stateManager.state.services || {}),
      lastUpdate: new Date().toISOString(),
      totalServices: this.services.length,
      proxiedServices: this.services.filter(s => s.enableProxy).length
    };
    await this.stateManager.save();
  }

  getStatus() {
    return {
      lastUpdate: this.stateManager.state.services?.lastUpdate || null,
      lastImport: this.stateManager.state.services?.lastImport || null,
      lastExport: this.stateManager.state.services?.lastExport || null,
      totalServices: this.services.length,
      proxiedServices: this.services.filter(s => s.enableProxy).length,
      enabled: this.config.enabled
    };
  }

  getAllowedDeviceIds() {
    const configuredDevices = this.config.allowedDevices || this.config.deviceIds || [];
    if (Array.isArray(configuredDevices) && configuredDevices.length > 0) {
      return configuredDevices.map(device => String(device));
    }

    const stateDevices = this.stateManager.state.devices?.devices || {};
    const stateIds = Object.keys(stateDevices);
    if (stateIds.length > 0) {
      return stateIds;
    }

    // Fallback to devices.json
    return this.devices.map(d => d.id);
  }

  getDeviceById(deviceId) {
    const normalizedId = String(deviceId);
    const configuredDevice = this.devices.find(device => String(device.id) === normalizedId) || null;
    const liveDevice = this.stateManager.state.devices?.devices?.[normalizedId] || null;

    if (!configuredDevice && !liveDevice) {
      return null;
    }

    return {
      id: normalizedId,
      name: configuredDevice?.name || `Device ${normalizedId}`,
      isKeyMachine: this.getAllowedDeviceIds().includes(normalizedId),
      ...configuredDevice,
      ...liveDevice
    };
  }

  getKeyMachines() {
    return this.getAllowedDeviceIds()
      .map(deviceId => this.getDeviceById(deviceId) || {
        id: String(deviceId),
        name: `Device ${deviceId}`,
        isKeyMachine: true,
        ipv4: `192.168.3.${deviceId}`,
        ipv6: null
      })
      .map(device => ({
        ...device,
        id: String(device.id),
        isKeyMachine: true
      }))
      .sort((a, b) => Number(a.id) - Number(b.id));
  }

  // ==================== 校验 ====================

  validateService(service) {
    const errors = [];
    const allowedDeviceIds = this.getAllowedDeviceIds();
    const normalizedService = normalizeServiceDomains(service);

    if (!normalizedService.id) errors.push('缺少服务ID');
    if (!normalizedService.name) errors.push('缺少服务名称');
    if (!normalizedService.device) errors.push('缺少设备ID');
    if (!normalizedService.internalPort) errors.push('缺少内部端口');

    // Auto-generate proxyDomain if missing
    if (!normalizedService.proxyDomain && normalizedService.id) {
      // not an error, will be auto-generated
    } else if (normalizedService.proxyDomain && !isManagedDomain(normalizedService.proxyDomain)) {
      errors.push(`域名必须属于 ${MANAGED_DOMAIN}: ${normalizedService.proxyDomain}`);
    }

    if (normalizedService.device && allowedDeviceIds.length > 0 && !allowedDeviceIds.includes(String(normalizedService.device))) {
      errors.push(`无效的设备ID: ${normalizedService.device}，当前可用设备: ${allowedDeviceIds.join(', ')}`);
    }

    if (normalizedService.internalPort) {
      const port = parseInt(normalizedService.internalPort, 10);
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        errors.push(`无效的端口号: ${normalizedService.internalPort}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      allowedDeviceIds
    };
  }

  // ==================== 代理配置生成 ====================

  prepareLuckyProxyConfig(id, deviceIPv6 = null) {
    const service = this.getServiceById(id);
    if (!service) {
      throw new Error(`服务ID ${id} 不存在`);
    }

    const targetHost = `192.168.3.${service.device}`;
    const formattedTargetHost = formatTargetHost(targetHost);
    const target = service.internalProtocol
      ? `${service.internalProtocol}://${formattedTargetHost}:${service.internalPort}`
      : `http://${formattedTargetHost}:${service.internalPort}`;

    return {
      port: service.lucky.port,
      name: `proxy-${service.id}`,
      remark: service.lucky.remark || service.name,
      domain: service.proxyDomain,
      target,
      type: service.proxyType,
      tls: service.enableTLS,
      advancedConfig: service.lucky.advancedConfig
    };
  }

  prepareSunPanelCardConfig(id, options = {}) {
    const service = this.getServiceById(id);
    if (!service) {
      throw new Error(`服务ID ${id} 不存在`);
    }

    const {
      publicUrl,
      lanUrl = service.sunpanel.lanUrl,
      iconUrl = service.sunpanel.icon,
      groupOnlyName
    } = options;

    return {
      title: service.name,
      url: publicUrl || (service.enableTLS
        ? `https://${service.proxyDomain}`
        : `http://${service.proxyDomain}`),
      onlyName: `svc-${service.id}`,
      iconUrl,
      lanUrl,
      description: service.description,
      itemGroupOnlyName: groupOnlyName || service.sunpanel.group,
      isSaveIcon: false
    };
  }

  /**
   * 为服务生成内网 IPv4 直连 URL
   * @param {string} serviceId
   * @param {string} host
   * @returns {string} LAN direct URL
   */
  buildLanDirectUrl(serviceId, host) {
    const service = this.getServiceById(serviceId);
    if (!service || !host) return null;

    const protocol = service.internalProtocol || inferInternalProtocol(service.internalPort);
    return `${protocol}://${host}:${service.internalPort}`;
  }
}

export default ServiceRegistry;
