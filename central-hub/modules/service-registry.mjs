/**
 * 服务清单管理模块
 * 负责管理需要反向代理的服务配置
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEnv } from '../../lib/utils/env-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, '..', 'config', 'services-registry.json');

const MANAGED_DOMAIN = getEnv('ALIYUN_DOMAIN', 'leecaiy.shop');

function buildManagedDomain(domainPrefix) {
  return `${domainPrefix}.${MANAGED_DOMAIN}`;
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

function buildDefaultLanUrl(service) {
  const protocol = service.enableTLS ? 'https' : 'http';
  return `${protocol}://192.168.3.${service.device}:${service.internalPort}`;
}

function formatTargetHost(targetHost) {
  return targetHost?.includes(':') ? `[${targetHost}]` : targetHost;
}

function isManagedDomain(domain) {
  return domain === MANAGED_DOMAIN || domain.endsWith(`.${MANAGED_DOMAIN}`);
}

export class ServiceRegistry {
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
    this.registryPath = REGISTRY_PATH;
    this.services = [];
  }

  /**
   * 初始化模块
   */
  async init() {
    console.log('[ServiceRegistry] 初始化服务清单管理模块...');

    // 加载服务清单
    await this.loadRegistry();

    // 初始化状态中的服务信息
    if (!this.stateManager.state.services) {
      this.stateManager.state.services = {
        lastUpdate: null,
        totalServices: 0,
        proxiedServices: 0
      };
    }

    console.log(`[ServiceRegistry] ✅ 服务清单管理模块初始化完成，共加载 ${this.services.length} 个服务`);
  }

  /**
   * 加载服务清单
   */
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

  /**
   * 保存服务清单
   */
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

  /**
   * 获取所有服务
   * @returns {Array>} 服务列表
   */
  getAllServices() {
    return this.services;
  }

  /**
   * 获取启用了代理的服务
   * @returns {Array>} 启用代理的服务列表
   */
  getProxiedServices() {
    return this.services.filter(s => s.enableProxy);
  }

  /**
   * 根据ID获取服务
   * @param {string} id - 服务ID
   * @returns {object|null>} 服务信息或null
   */
  getServiceById(id) {
    return this.services.find(s => s.id === id) || null;
  }

  /**
   * 根据设备获取服务
   * @param {string} device - 设备ID
   * @returns {Array>} 服务列表
   */
  getServicesByDevice(device) {
    return this.services.filter(s => s.device === device);
  }

  /**
   * 根据域名获取服务
   * @param {string} domain - 域名
   * @returns {object|null>} 服务信息或null
   */
  getServiceByDomain(domain) {
    return this.services.find(s => s.proxyDomain === domain) || null;
  }

  /**
   * 添加新服务
   * @param {object} service - 服务配置
   * @returns {object>} 添加的服务
   */
  async addService(service) {
    // 检查ID是否已存在
    if (this.services.some(s => s.id === service.id)) {
      throw new Error(`服务ID ${service.id} 已存在`);
    }

    const normalizedInput = normalizeServiceDomains(service);

    // 设置默认值
    const newService = {
      enableProxy: true,
      proxyType: 'reverseproxy',
      enableTLS: false,
      ...normalizedInput,
      lucky: {
        port: 50000,
        remark: normalizedInput.name,
        advancedConfig: '',
        ...normalizedInput.lucky
      },
      sunpanel: {
        group: '其他',
        icon: `https://${normalizedInput.proxyDomain}/favicon.ico`,
        lanUrl: buildDefaultLanUrl(normalizedInput),
        ...normalizedInput.sunpanel
      }
    };

    this.services.push(newService);
    await this.saveRegistry();

    // 更新状态
    await this.updateState();

    console.log(`[ServiceRegistry] ✅ 服务已添加: ${newService.name} (${newService.id})`);
    return newService;
  }

  /**
   * 更新服务
   * @param {string} id - 服务ID
   * @param {object} updates - 更新内容
   * @returns {object>} 更新后的服务
   */
  async updateService(id, updates) {
    const index = this.services.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error(`服务ID ${id} 不存在`);
    }

    const existingService = this.services[index];
    this.services[index] = normalizeServiceDomains({
      ...existingService,
      ...updates,
      lucky: {
        ...existingService.lucky,
        ...updates.lucky
      },
      sunpanel: {
        ...existingService.sunpanel,
        ...updates.sunpanel
      }
    });

    await this.saveRegistry();
    await this.updateState();

    console.log(`[ServiceRegistry] ✅ 服务已更新: ${this.services[index].name} (${id})`);
    return this.services[index];
  }

  /**
   * 删除服务
   * @param {string} id - 服务ID
   */
  async deleteService(id) {
    const index = this.services.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error(`服务ID ${id} 不存在`);
    }

    const removed = this.services.splice(index, 1)[0];
    await this.saveRegistry();
    await this.updateState();

    console.log(`[ServiceRegistry] ✅ 服务已删除: ${removed.name} (${id})`);
  }

  /**
   * 更新状态管理器
   */
  async updateState() {
    this.stateManager.state.services = {
      lastUpdate: new Date().toISOString(),
      totalServices: this.services.length,
      proxiedServices: this.services.filter(s => s.enableProxy).length
    };

    await this.stateManager.save();
  }

  /**
   * 获取服务状态摘要
   * @returns {object>} 状态摘要
   */
  getStatus() {
    return {
      lastUpdate: this.stateManager.state.services?.lastUpdate || null,
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

    return [];
  }

  validateService(service) {
    const errors = [];
    const allowedDeviceIds = this.getAllowedDeviceIds();
    const normalizedService = normalizeServiceDomains(service);

    if (!normalizedService.id) errors.push('缺少服务ID');
    if (!normalizedService.name) errors.push('缺少服务名称');
    if (!normalizedService.device) errors.push('缺少设备ID');
    if (!normalizedService.internalPort) errors.push('缺少内部端口');
    if (!normalizedService.proxyDomain) errors.push('缺少代理域名');

    if (normalizedService.device && allowedDeviceIds.length > 0 && !allowedDeviceIds.includes(String(normalizedService.device))) {
      errors.push(`无效的设备ID: ${normalizedService.device}，当前可用设备: ${allowedDeviceIds.join(', ')}`);
    }

    if (normalizedService.internalPort) {
      const port = parseInt(normalizedService.internalPort, 10);
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        errors.push(`无效的端口号: ${normalizedService.internalPort}`);
      }
    }

    if (normalizedService.proxyDomain && !isManagedDomain(normalizedService.proxyDomain)) {
      errors.push(`域名必须属于 ${MANAGED_DOMAIN}: ${normalizedService.proxyDomain}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      allowedDeviceIds
    };
  }

  /**
   * 准备服务的Lucky代理配置
   * @param {string} id - 服务ID
   * @param {string} deviceIPv6 - 设备的IPv6地址（可选）
   * @returns {object>} Lucky代理配置
   */
  prepareLuckyProxyConfig(id, deviceIPv6 = null) {
    const service = this.getServiceById(id);
    if (!service) {
      throw new Error(`服务ID ${id} 不存在`);
    }

    // 构建目标地址：优先使用IPv6，否则使用IPv4
    const targetHost = deviceIPv6 || `192.168.3.${service.device}`;
    const formattedTargetHost = formatTargetHost(targetHost);
    const target = service.enableTLS
      ? `https://${formattedTargetHost}:${service.internalPort}`
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

  /**
   * 准备服务的SunPanel卡片配置
   * @param {string} id - 服务ID
   * @returns {object>} SunPanel卡片配置
   */
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
}

export default ServiceRegistry;
