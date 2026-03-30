/**
 * 服务清单管理模块
 * 负责管理需要反向代理的服务配置
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ServiceRegistry {
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
    this.registryPath = path.join(process.cwd(), 'config', 'services-registry.json');
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
        services: {},
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
      this.services = data.services || [];
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
      const data = { services: this.services };
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

    // 设置默认值
    const newService = {
      enableProxy: true,
      proxyType: 'reverseproxy',
      enableTLS: false,
      lucky: {
        port: 50000,
        remark: service.name,
        advancedConfig: ''
      },
      sunpanel: {
        group: '其他',
        icon: `https://${service.proxyDomain}/favicon.ico`,
        lanUrl: `http://192.168.3.${service.device}:${service.internalPort}`
      },
      ...service
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

    this.services[index] = {
      ...this.services[index],
      ...updates
    };

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
    const servicesMap = {};
    this.services.forEach(service => {
      servicesMap[service.id] = {
        ...service,
        lastUpdate: new Date().toISOString()
      };
    });

    this.stateManager.state.services = {
      lastUpdate: new Date().toISOString(),
      services: servicesMap,
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

  /**
   * 验证服务配置
   * @param {object} service - 服务配置
   * @returns {object>} 验证结果
   */
  validateService(service) {
    const errors = [];

    // 必填字段
    if (!service.id) errors.push('缺少服务ID');
    if (!service.name) errors.push('缺少服务名称');
    if (!service.device) errors.push('缺少设备ID');
    if (!service.internalPort) errors.push('缺少内部端口');
    if (!service.proxyDomain) errors.push('缺少代理域名');

    // 设备ID验证
    if (service.device && !['2', '10', '200', '201', '254'].includes(service.device)) {
      errors.push(`无效的设备ID: ${service.device}`);
    }

    // 端口验证
    if (service.internalPort) {
      const port = parseInt(service.internalPort);
      if (isNaN(port) || port < 1 || port > 65535) {
        errors.push(`无效的端口号: ${service.internalPort}`);
      }
    }

    // 域名格式验证
    if (service.proxyDomain && !service.proxyDomain.includes('leecaiy.xyz')) {
      errors.push(`域名必须包含 leecaiy.xyz: ${service.proxyDomain}`);
    }

    return {
      valid: errors.length === 0,
      errors
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
    const target = service.enableTLS
      ? `https://${targetHost}:${service.internalPort}`
      : `http://${targetHost}:${service.internalPort}`;

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
  prepareSunPanelCardConfig(id) {
    const service = this.getServiceById(id);
    if (!service) {
      throw new Error(`服务ID ${id} 不存在`);
    }

    return {
      title: service.name,
      url: service.enableTLS
        ? `https://${service.proxyDomain}`
        : `http://${service.proxyDomain}`,
      onlyName: `svc-${service.id}`,
      iconUrl: service.sunpanel.icon,
      lanUrl: service.sunpanel.lanUrl,
      description: service.description,
      itemGroupOnlyName: service.sunpanel.group,
      isSaveIcon: false
    };
  }
}

export default ServiceRegistry;
