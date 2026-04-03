/**
 * Cloudflare DNS 管理模块
 * 负责将服务注册表中的代理配置同步到 Cloudflare DNS
 */

import {
  listDnsRecords,
  findDnsRecord,
  upsertDnsRecord,
  deleteDnsRecordByName,
  verifyToken,
  getCfAuthConfig
} from '../../lib/api-clients/cloudflare-api.mjs';
import { getEnv } from '../../lib/utils/env-loader.mjs';

export class CloudflareManager {
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
    this.cfConfig = {
      apiToken: config.apiToken || getEnv('CF_API_TOKEN', ''),
      zoneId: config.zoneId || getEnv('CF_ZONE_ID', ''),
      domain: config.domain || getEnv('CF_DOMAIN', ''),
      proxied: config.proxied !== false,
      autoSync: config.autoSync !== false
    };
  }

  hasAuthConfig() {
    const auth = getCfAuthConfig(this.cfConfig);
    return auth.ready;
  }

  ensureState() {
    if (!this.stateManager.state.cloudflare) {
      this.stateManager.state.cloudflare = {
        lastSync: null,
        records: {},
        syncStatus: {}
      };
    }
  }

  /**
   * 初始化模块
   */
  async init() {
    console.log('[CloudflareManager] 初始化 Cloudflare 管理模块...');

    if (!this.config.enabled) {
      console.log('[CloudflareManager] ⚠️  Cloudflare 模块未启用');
      return;
    }

    if (!this.cfConfig.apiToken) {
      console.warn('[CloudflareManager] ⚠️  CF_API_TOKEN 未设置，Cloudflare 同步功能将不可用');
      console.warn('[CloudflareManager] 请在 .env 中设置 CF_API_TOKEN');
      return;
    }

    if (!this.cfConfig.zoneId) {
      console.warn('[CloudflareManager] ⚠️  CF_ZONE_ID 未设置，Cloudflare 同步功能将不可用');
      console.warn('[CloudflareManager] 请在 .env 中设置 CF_ZONE_ID');
      return;
    }

    this.ensureState();

    // 验证 Token 有效性
    try {
      const tokenResult = await verifyToken(this.cfConfig);
      if (tokenResult.valid) {
        console.log(`[CloudflareManager] ✅ Token 验证通过，域名: ${this.cfConfig.domain}`);
      } else {
        console.warn(`[CloudflareManager] ⚠️  Token 状态: ${tokenResult.status}`);
      }
    } catch (error) {
      console.warn(`[CloudflareManager] ⚠️  Token 验证失败: ${error.message}`);
    }

    console.log('[CloudflareManager] ✅ Cloudflare 管理模块初始化完成');
  }

  /**
   * 同步服务清单到 Cloudflare DNS
   * @param {Array} services - 服务列表
   * @param {object} ipv6Map - IPv6 地址映射（可选，用于 AAAA 记录）
   */
  async syncServicesToCF(services, ipv6Map = {}) {
    if (!this.config.enabled || !this.hasAuthConfig()) {
      console.log('[CloudflareManager] ⚠️  Cloudflare 模块未启用或认证信息未设置，跳过同步');
      return {
        success: 0,
        failed: 0,
        skipped: 0,
        updated: 0,
        unchanged: 0,
        details: []
      };
    }

    this.ensureState();
    console.log('[CloudflareManager] 🔄 开始同步服务到 Cloudflare DNS...');

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      updated: 0,
      unchanged: 0,
      details: []
    };

    // 获取服务器公网 IPv4（用于 A 记录）
    let publicIPv4 = this.cfConfig.publicIp || getEnv('PUBLIC_IPV4', '');
    if (!publicIPv4) {
      try {
        publicIPv4 = await this._fetchPublicIPv4();
        console.log(`[CloudflareManager] 📡 获取公网 IPv4: ${publicIPv4}`);
      } catch (error) {
        console.error(`[CloudflareManager] ❌ 获取公网 IPv4 失败: ${error.message}`);
        console.log('[CloudflareManager] 将尝试使用 IPv6 记录代替');
      }
    }

    for (const service of services) {
      // 只同步有 cfDomain 的服务
      if (!service.enableProxy || !service.cfDomain) {
        results.skipped += 1;
        continue;
      }

      try {
        const cfDomain = service.cfDomain;
        const deviceIPv6 = ipv6Map[service.device] || null;

        // 优先创建 A 记录（公网 IPv4），同时创建 AAAA 记录（设备 IPv6）
        const recordsToSync = [];

        if (publicIPv4) {
          recordsToSync.push({
            type: 'A',
            name: cfDomain,
            content: publicIPv4,
            proxied: this.cfConfig.proxied,
            comment: `${service.name} - auto-dnns (A)`
          });
        }

        if (deviceIPv6) {
          recordsToSync.push({
            type: 'AAAA',
            name: cfDomain,
            content: deviceIPv6,
            proxied: this.cfConfig.proxied,
            comment: `${service.name} - auto-dnns (AAAA)`
          });
        }

        if (recordsToSync.length === 0) {
          console.warn(`[CloudflareManager] ⚠️  服务 ${service.name} 无可用 IP，跳过`);
          results.skipped += 1;
          results.details.push({
            service: service.id,
            action: 'skipped',
            reason: '无可用 IP 地址'
          });
          continue;
        }

        let serviceAction = 'unchanged';

        for (const record of recordsToSync) {
          const result = await upsertDnsRecord(record, this.cfConfig.zoneId, this.cfConfig);

          if (result.action === 'created') {
            serviceAction = 'created';
            console.log(`[CloudflareManager] ✅ 创建 DNS: ${record.type} ${cfDomain} → ${record.content}`);
          } else if (result.action === 'updated') {
            serviceAction = 'updated';
            console.log(`[CloudflareManager] ✅ 更新 DNS: ${record.type} ${cfDomain} → ${record.content}`);
          } else {
            console.log(`[CloudflareManager] ⏭️  无变化: ${record.type} ${cfDomain}`);
          }
        }

        if (serviceAction === 'unchanged') {
          results.unchanged += 1;
        } else if (serviceAction === 'updated') {
          results.updated += 1;
          results.success += 1;
        } else {
          results.success += 1;
        }

        // 保存同步状态
        this.stateManager.state.cloudflare.syncStatus[cfDomain] = {
          serviceId: service.id,
          serviceName: service.name,
          domain: cfDomain,
          ip: publicIPv4 || deviceIPv6,
          proxied: this.cfConfig.proxied,
          lastSync: new Date().toISOString()
        };

        results.details.push({
          service: service.id,
          action: serviceAction,
          domain: cfDomain,
          ip: publicIPv4 || deviceIPv6
        });

      } catch (error) {
        results.failed += 1;
        console.error(`[CloudflareManager] ❌ 同步失败: ${service.name} - ${error.message}`);
        results.details.push({
          service: service.id,
          action: 'error',
          error: error.message
        });
      }
    }

    this.stateManager.state.cloudflare.lastSync = new Date().toISOString();
    await this.stateManager.save();

    console.log(
      `[CloudflareManager] 🎉 同步完成: 成功 ${results.success}, 更新 ${results.updated}, ` +
      `无变化 ${results.unchanged}, 失败 ${results.failed}, 跳过 ${results.skipped}`
    );
    return results;
  }

  /**
   * 获取所有 CF DNS 记录
   */
  async getDnsRecords() {
    if (!this.config.enabled || !this.hasAuthConfig()) {
      return [];
    }

    try {
      const records = await listDnsRecords(this.cfConfig.zoneId, {}, this.cfConfig);
      return records.map(r => ({
        id: r.id,
        type: r.type,
        name: r.name,
        content: r.content,
        proxied: r.proxied,
        ttl: r.ttl,
        comment: r.comment
      }));
    } catch (error) {
      console.error('[CloudflareManager] ❌ 获取 DNS 记录失败:', error.message);
      return [];
    }
  }

  /**
   * 删除 CF 中的 DNS 记录
   * @param {string} name - 完整域名
   * @param {string} type - 记录类型
   */
  async deleteRecord(name, type = 'A') {
    if (!this.config.enabled || !this.hasAuthConfig()) {
      throw new Error('Cloudflare 模块未启用或认证信息未设置');
    }

    this.ensureState();

    try {
      const result = await deleteDnsRecordByName(name, type, this.cfConfig.zoneId, this.cfConfig);
      if (result.action === 'deleted') {
        console.log(`[CloudflareManager] ✅ 删除 DNS: ${type} ${name}`);
        delete this.stateManager.state.cloudflare.syncStatus[name];
        await this.stateManager.save();
      } else {
        console.warn(`[CloudflareManager] ⚠️  记录不存在: ${type} ${name}`);
      }
      return result;
    } catch (error) {
      console.error(`[CloudflareManager] ❌ 删除 DNS 失败: ${name} - ${error.message}`);
      throw error;
    }
  }

  /**
   * 验证 Token 有效性
   */
  async verifyToken() {
    if (!this.cfConfig.apiToken) {
      return { valid: false, reason: 'Token 未设置' };
    }

    try {
      return await verifyToken(this.cfConfig);
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }

  /**
   * 获取公网 IPv4 地址
   */
  async _fetchPublicIPv4() {
    const services = [
      'https://api.ipify.org?format=json',
      'https://httpbin.org/ip',
      'https://api.ip.sb/ip'
    ];

    for (const url of services) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) continue;

        if (url.includes('ipify')) {
          const data = await response.json();
          return data.ip;
        } else if (url.includes('httpbin')) {
          const data = await response.json();
          return data.origin;
        } else {
          const text = await response.text();
          return text.trim();
        }
      } catch {
        continue;
      }
    }

    throw new Error('无法获取公网 IPv4 地址');
  }

  /**
   * 获取状态摘要
   */
  getStatus() {
    this.ensureState();

    return {
      enabled: this.config.enabled && this.hasAuthConfig(),
      domain: this.cfConfig.domain,
      proxied: this.cfConfig.proxied,
      lastSync: this.stateManager.state.cloudflare?.lastSync || null,
      recordCount: Object.keys(this.stateManager.state.cloudflare?.syncStatus || {}).length,
      authReady: this.hasAuthConfig()
    };
  }
}

export default CloudflareManager;
