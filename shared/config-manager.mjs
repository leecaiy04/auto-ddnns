#!/usr/bin/env node
/**
 * 配置管理器
 * 统一管理配置加载、验证和运行时覆盖
 */

import { loadConfigWithEnv } from './config-loader.mjs';

const DEFAULT_DOMAIN = 'leecaiy.shop';

export class ConfigManager {
  constructor() {
    this.config = null;
    this.configPath = null;
  }

  /**
   * 加载并处理配置
   * @param {string} configPath - 配置文件路径
   * @returns {Promise<Object>} 完整的配置对象
   */
  async load(configPath) {
    this.configPath = configPath;

    // 1. 加载基础配置（env + json）
    this.config = await loadConfigWithEnv(configPath);

    // 2. 应用运行时覆盖
    this.applyRuntimeOverrides();

    // 3. 验证配置
    this.validate();

    return this.config;
  }

  /**
   * 应用运行时配置覆盖
   * 主要处理多实例配置（Lucky, SunPanel）
   */
  applyRuntimeOverrides() {
    // Lucky 多实例配置
    if (this.config?.modules?.lucky) {
      this.config.modules.lucky.instances = this.buildLuckyInstances();
    }

    // SunPanel 多实例配置
    if (this.config?.modules?.sunpanel) {
      this.config.modules.sunpanel.instances = this.buildSunPanelInstances();
    }
  }

  /**
   * 构建 Lucky 实例配置
   * @returns {Array} Lucky 实例数组
   */
  buildLuckyInstances() {
    const instances = [];
    const managedDomain = this.getManagedDomain();

    // 主实例
    if (process.env.LUCKY_API_BASE) {
      instances.push({
        apiBase: process.env.LUCKY_API_BASE,
        openToken: process.env.LUCKY_OPEN_TOKEN ||
                   process.env.LUCKY_TOKEN ||
                   process.env.LUCKY_API_TOKEN,
        username: process.env.LUCKY_USERNAME,
        password: process.env.LUCKY_PASSWORD
      });
    } else {
      // 默认配置
      instances.push({
        apiBase: `https://lucky.${managedDomain}:55000/666`
      });
    }

    // 备用实例
    if (process.env.LUCKY_BACKUP_API_BASE) {
      instances.push({
        apiBase: process.env.LUCKY_BACKUP_API_BASE,
        openToken: process.env.LUCKY_BACKUP_OPEN_TOKEN ||
                   process.env.LUCKY_BACKUP_TOKEN ||
                   process.env.LUCKY_BACKUP_API_TOKEN,
        username: process.env.LUCKY_BACKUP_USERNAME,
        password: process.env.LUCKY_BACKUP_PASSWORD
      });
    }

    return instances;
  }

  /**
   * 构建 SunPanel 实例配置
   * @returns {Array} SunPanel 实例数组
   */
  buildSunPanelInstances() {
    const instances = [];

    // 主实例
    if (process.env.SUNPANEL_API_BASE) {
      instances.push({
        apiBase: process.env.SUNPANEL_API_BASE,
        apiToken: process.env.SUNPANEL_API_TOKEN,
        username: process.env.SUNPANEL_USERNAME,
        password: process.env.SUNPANEL_PASSWORD
      });
    }

    // 备用实例
    if (process.env.SUNPANEL_BACKUP_API_BASE) {
      instances.push({
        apiBase: process.env.SUNPANEL_BACKUP_API_BASE,
        apiToken: process.env.SUNPANEL_BACKUP_API_TOKEN,
        username: process.env.SUNPANEL_BACKUP_USERNAME,
        password: process.env.SUNPANEL_BACKUP_PASSWORD
      });
    }

    return instances;
  }

  /**
   * 获取管理的域名
   * @returns {string} 域名
   */
  getManagedDomain() {
    return (process.env.ALIYUN_DOMAIN || DEFAULT_DOMAIN).trim() || DEFAULT_DOMAIN;
  }

  /**
   * 验证配置
   * 检查必需的配置项
   */
  validate() {
    const errors = [];

    // 验证 Lucky 配置
    if (this.config.modules.lucky?.enabled) {
      const instances = this.config.modules.lucky.instances || [];
      if (instances.length === 0) {
        errors.push('Lucky 已启用但未配置任何实例');
      }

      instances.forEach((instance, index) => {
        if (!instance.apiBase) {
          errors.push(`Lucky 实例 ${index + 1} 缺少 apiBase`);
        }
      });
    }

    // 验证 SunPanel 配置
    if (this.config.modules.sunpanel?.enabled) {
      const instances = this.config.modules.sunpanel.instances || [];
      if (instances.length === 0) {
        errors.push('SunPanel 已启用但未配置任何实例');
      }

      instances.forEach((instance, index) => {
        if (!instance.apiBase) {
          errors.push(`SunPanel 实例 ${index + 1} 缺少 apiBase`);
        }
      });
    }

    // 验证 Cloudflare 配置
    if (this.config.modules.cloudflare?.enabled) {
      if (!this.config.modules.cloudflare.apiToken) {
        errors.push('Cloudflare 已启用但未配置 apiToken');
      }
      if (!this.config.modules.cloudflare.zoneId) {
        errors.push('Cloudflare 已启用但未配置 zoneId');
      }
    }

    // 验证设备监控配置
    if (this.config.modules.deviceMonitor?.enabled) {
      const router = this.config.modules.deviceMonitor.router;
      if (!router?.host) {
        errors.push('DeviceMonitor 已启用但未配置路由器地址');
      }
    }

    if (errors.length > 0) {
      throw new Error(`配置验证失败:\n  - ${errors.join('\n  - ')}`);
    }
  }

  /**
   * 获取配置对象
   * @returns {Object} 配置对象
   */
  get() {
    if (!this.config) {
      throw new Error('配置尚未加载，请先调用 load()');
    }
    return this.config;
  }

  /**
   * 获取模块配置
   * @param {string} moduleName - 模块名称
   * @returns {Object} 模块配置
   */
  getModule(moduleName) {
    return this.config?.modules?.[moduleName] || null;
  }

  /**
   * 检查模块是否启用
   * @param {string} moduleName - 模块名称
   * @returns {boolean} 是否启用
   */
  isModuleEnabled(moduleName) {
    return this.config?.modules?.[moduleName]?.enabled === true;
  }

  /**
   * 重新加载配置（热更新）
   * @returns {Promise<Object>} 新的配置对象
   */
  async reload() {
    if (!this.configPath) {
      throw new Error('无法重新加载：未知的配置文件路径');
    }
    console.log('🔄 重新加载配置...');
    return await this.load(this.configPath);
  }

  /**
   * 获取配置摘要（用于日志和调试）
   * @param {boolean} redact - 是否脱敏敏感信息
   * @returns {Object} 配置摘要
   */
  getSummary(redact = true) {
    if (!this.config) {
      return null;
    }

    const summary = {
      server: {
        host: this.config.server.host,
        port: this.config.server.port
      },
      modules: {}
    };

    // 遍历模块
    for (const [name, config] of Object.entries(this.config.modules || {})) {
      summary.modules[name] = {
        enabled: config.enabled
      };

      // Lucky 实例摘要
      if (name === 'lucky' && config.instances) {
        summary.modules[name].instances = config.instances.map((inst, i) => ({
          index: i + 1,
          apiBase: inst.apiBase,
          hasToken: !!inst.openToken,
          hasCredentials: !!(inst.username && inst.password)
        }));
      }

      // SunPanel 实例摘要
      if (name === 'sunpanel' && config.instances) {
        summary.modules[name].instances = config.instances.map((inst, i) => ({
          index: i + 1,
          apiBase: inst.apiBase,
          hasToken: !!inst.apiToken,
          hasCredentials: !!(inst.username && inst.password)
        }));
      }

      // Cloudflare 摘要
      if (name === 'cloudflare' && config.enabled) {
        summary.modules[name].domain = config.domain;
        summary.modules[name].hasToken = !!config.apiToken;
        summary.modules[name].hasZoneId = !!config.zoneId;
      }
    }

    return summary;
  }

  /**
   * 打印配置摘要到控制台
   */
  printSummary() {
    const summary = this.getSummary();
    console.log('\n📋 配置摘要:');
    console.log(`   服务器: ${summary.server.host}:${summary.server.port}`);
    console.log('\n   已启用的模块:');

    for (const [name, config] of Object.entries(summary.modules)) {
      if (config.enabled) {
        console.log(`   ✅ ${name}`);

        if (config.instances) {
          config.instances.forEach(inst => {
            const auth = inst.hasToken ? 'Token' :
                        inst.hasCredentials ? 'Credentials' : 'None';
            console.log(`      - 实例 ${inst.index}: ${inst.apiBase} (${auth})`);
          });
        }

        if (name === 'cloudflare' && config.domain) {
          console.log(`      - 域名: ${config.domain}`);
        }
      }
    }
    console.log('');
  }
}

// 单例模式
let instance = null;

/**
 * 获取 ConfigManager 单例
 * @returns {ConfigManager}
 */
export function getConfigManager() {
  if (!instance) {
    instance = new ConfigManager();
  }
  return instance;
}

export default ConfigManager;
