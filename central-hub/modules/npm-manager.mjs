/**
 * Nginx Proxy Manager 管理模块
 * 负责将服务注册表中的代理配置同步到 NPM
 */

import {
  getProxyHosts,
  findProxyHostByDomain,
  createProxyHost,
  updateProxyHost,
  deleteProxyHost,
  setProxyHostEnabled,
  getNpmAuthConfig
} from '../../lib/api-clients/npm-api.mjs';
import { getEnv } from '../../lib/utils/env-loader.mjs';

export class NPMManager {
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
    this.npmConfig = {
      apiBase: config.apiBase || getEnv('NPM_API_BASE', 'http://192.168.3.200:50001'),
      apiToken: config.apiToken || getEnv('NPM_API_TOKEN', ''),
      apiEmail: config.apiEmail || config.apiIdentity || getEnv('NPM_API_EMAIL', getEnv('NPM_API_IDENTITY', '')),
      apiPassword: config.apiPassword || config.apiSecret || getEnv('NPM_API_PASSWORD', getEnv('NPM_API_SECRET', '')),
      httpsPort: parseInt(`${config.httpsPort || getEnv('NPM_HTTPS_PORT', '50001')}`, 10),
      syncFromLucky: config.syncFromLucky !== false,
      autoSync: config.autoSync !== false
    };
  }

  hasAuthConfig() {
    return getNpmAuthConfig(this.npmConfig).mode !== 'none';
  }

  ensureState() {
    if (!this.stateManager.state.npm) {
      this.stateManager.state.npm = {
        lastSync: null,
        proxies: {},
        syncStatus: {}
      };
    }
  }

  /**
   * 初始化模块
   */
  async init() {
    console.log('[NPMManager] 初始化 NPM 管理模块...');

    if (!this.config.enabled) {
      console.log('[NPMManager] ⚠️  NPM 模块未启用');
      return;
    }

    if (!this.hasAuthConfig()) {
      console.warn('[NPMManager] ⚠️  NPM 鉴权信息未设置，NPM 同步功能将不可用');
      console.warn('[NPMManager] 请设置 NPM_API_TOKEN，或同时设置 NPM_API_EMAIL / NPM_API_PASSWORD');
    }

    this.ensureState();

    console.log('[NPMManager] ✅ NPM 管理模块初始化完成');
  }

  /**
   * 同步服务清单到 NPM
   * @param {Array} services - 服务列表
   * @param {object} ipv6Map - IPv6 地址映射
   */
  async syncServicesToNPM(services, ipv6Map = {}) {
    if (!this.config.enabled || !this.hasAuthConfig()) {
      console.log('[NPMManager] ⚠️  NPM 模块未启用或鉴权信息未设置，跳过同步');
      return {
        success: 0,
        failed: 0,
        skipped: 0,
        updated: 0,
        details: []
      };
    }

    this.ensureState();
    console.log('[NPMManager] 🔄 开始同步服务到 NPM...');

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      updated: 0,
      details: []
    };

    for (const service of services) {
      if (!service.enableProxy) {
        results.skipped += 1;
        continue;
      }

      try {
        const deviceIPv6 = ipv6Map[service.device] || null;
        const targetHost = deviceIPv6 || `192.168.3.${service.device}`;
        const forward_port = parseInt(service.internalPort, 10);
        const forward_scheme = service.enableTLS ? 'https' : 'http';
        const existing = await findProxyHostByDomain(service.proxyDomain, this.npmConfig);

        const proxyConfig = {
          domain_names: [service.proxyDomain],
          forward_host: targetHost,
          forward_port,
          forward_scheme,
          ssl_enabled: service.enableTLS,
          http2_support: service.enableTLS,
          advanced_config: `
# ${service.name}
# ${service.description}
# Created by Central Hub from Service Registry
          `.trim(),
          allow_websocket_upgrade: true,
          block_exploits: true
        };

        let action = 'created';
        if (existing) {
          await updateProxyHost(existing.id, proxyConfig, this.npmConfig);
          action = 'updated';
          results.updated += 1;
        } else {
          await createProxyHost(proxyConfig, this.npmConfig);
        }

        results.success += 1;
        this.stateManager.state.npm.syncStatus[service.proxyDomain] = {
          serviceId: service.id,
          serviceName: service.name,
          domain: service.proxyDomain,
          targetHost,
          targetPort: forward_port,
          ssl: service.enableTLS,
          lastSync: new Date().toISOString()
        };

        console.log(`[NPMManager] ✅ ${action === 'created' ? '创建' : '更新'}代理: ${service.name} (${service.proxyDomain})`);
        results.details.push({
          service: service.id,
          action,
          domain: service.proxyDomain,
          target: `${forward_scheme}://${targetHost}:${forward_port}`
        });
      } catch (error) {
        results.failed += 1;
        console.error(`[NPMManager] ❌ 同步失败: ${service.name} - ${error.message}`);
        results.details.push({
          service: service.id,
          action: 'error',
          error: error.message
        });
      }
    }

    this.stateManager.state.npm.lastSync = new Date().toISOString();
    await this.stateManager.save();

    console.log(`[NPMManager] 🎉 同步完成: 成功 ${results.success}, 更新 ${results.updated}, 失败 ${results.failed}, 跳过 ${results.skipped}`);
    return results;
  }

  /**
   * 获取所有 NPM 代理主机
   */
  async getProxyHosts() {
    if (!this.config.enabled || !this.hasAuthConfig()) {
      return [];
    }

    try {
      const hosts = await getProxyHosts(this.npmConfig);
      return hosts.map((host) => ({
        id: host.id,
        domain_names: host.domain_names,
        forward_host: host.forward_host,
        forward_port: host.forward_port,
        forward_scheme: host.forward_scheme,
        enabled: host.enabled,
        ssl_enabled: host.ssl_enabled,
        http2_support: host.http2_support_enabled
      }));
    } catch (error) {
      console.error('[NPMManager] ❌ 获取 NPM 代理主机失败:', error.message);
      return [];
    }
  }

  /**
   * 删除 NPM 中的代理主机
   * @param {string} domain - 域名
   */
  async deleteProxyHost(domain) {
    if (!this.config.enabled || !this.hasAuthConfig()) {
      throw new Error('NPM 模块未启用或鉴权信息未设置');
    }

    this.ensureState();

    try {
      const existing = await findProxyHostByDomain(domain, this.npmConfig);
      if (!existing) {
        console.warn(`[NPMManager] ⚠️  代理不存在: ${domain}`);
        return { success: false, message: '代理不存在' };
      }

      await deleteProxyHost(existing.id, this.npmConfig);
      console.log(`[NPMManager] ✅ 删除代理: ${domain}`);
      delete this.stateManager.state.npm.syncStatus[domain];
      await this.stateManager.save();

      return { success: true };
    } catch (error) {
      console.error(`[NPMManager] ❌ 删除代理失败: ${domain} - ${error.message}`);
      throw error;
    }
  }

  /**
   * 启用/禁用代理主机
   * @param {string} domain - 域名
   * @param {boolean} enabled - 是否启用
   */
  async setProxyHostEnabled(domain, enabled) {
    if (!this.config.enabled || !this.hasAuthConfig()) {
      throw new Error('NPM 模块未启用或鉴权信息未设置');
    }

    try {
      const existing = await findProxyHostByDomain(domain, this.npmConfig);
      if (!existing) {
        console.warn(`[NPMManager] ⚠️  代理不存在: ${domain}`);
        return { success: false, message: '代理不存在' };
      }

      await setProxyHostEnabled(existing.id, enabled, this.npmConfig);
      console.log(`[NPMManager] ✅ ${enabled ? '启用' : '禁用'}代理: ${domain}`);
      return { success: true };
    } catch (error) {
      console.error(`[NPMManager] ❌ 设置代理状态失败: ${domain} - ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取状态摘要
   */
  getStatus() {
    this.ensureState();

    return {
      lastSync: this.stateManager.state.npm?.lastSync || null,
      enabled: this.config.enabled && this.hasAuthConfig(),
      port: this.npmConfig.httpsPort,
      syncCount: Object.keys(this.stateManager.state.npm?.syncStatus || {}).length,
      authMode: getNpmAuthConfig(this.npmConfig).mode
    };
  }
}

export default NPMManager;
