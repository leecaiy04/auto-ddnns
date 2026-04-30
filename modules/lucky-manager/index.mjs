/**
 * Lucky 管理模块
 * 负责管理 Lucky 反向代理规则和 SSL 证书
 */

import crypto from 'crypto';
import {
  getAllProxies,
  smartAddOrUpdateSubRule,
  listAllPorts
} from './lucky-port-manager.mjs';
import {
  deletePort,
  deleteSubRuleByDomain
} from './lucky-reverseproxy.mjs';
import {
  getSSLList,
  applyACMECert
} from './lucky-ssl.mjs';
import {
  getDDNSTaskList,
  createDDNSTask,
  deleteDDNSTask,
  manualSyncDDNS,
  getDDNSLogs,
  buildAliyunDNSCredentials,
  buildRecord
} from './lucky-ddns.mjs';
import { getEnv } from '../../shared/env-loader.mjs';

function formatTargetHost(targetHost) {
  return targetHost?.includes(':') ? `[${targetHost}]` : targetHost;
}

function stripIPv6Brackets(host) {
  return host?.replace(/^\[/, '').replace(/\]$/, '');
}

function isLoopbackHost(host) {
  const normalized = stripIPv6Brackets(host)?.toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function isPrivateIPv4(host) {
  return /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function isPrivateHost(host) {
  const normalized = stripIPv6Brackets(host);
  return Boolean(normalized) && (
    isPrivateIPv4(normalized) ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fe80:')
  );
}

function extractUrlHost(value) {
  if (!value) return null;

  try {
    return stripIPv6Brackets(new URL(value).hostname);
  } catch {
    return null;
  }
}

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase();
}

function isSingleLabelSubdomain(host, baseDomain) {
  if (!host || !baseDomain) return false;
  if (!host.endsWith(`.${baseDomain}`)) return false;

  const hostParts = host.split('.');
  const baseParts = baseDomain.split('.');
  return hostParts.length === baseParts.length + 1;
}

function doesCertDomainCoverTarget(certDomain, targetDomain) {
  const cert = normalizeDomain(certDomain);
  const target = normalizeDomain(targetDomain);

  if (!cert || !target) return false;
  if (cert === target) return true;

  if (cert.startsWith('*.') && !target.startsWith('*.')) {
    return isSingleLabelSubdomain(target, cert.slice(2));
  }

  return false;
}

function extractCertDomains(cert) {
  const candidates = cert?.CertsInfo?.Domains || cert?.Domains || cert?.domains || [];

  if (Array.isArray(candidates)) {
    return candidates.map(normalizeDomain).filter(Boolean);
  }

  if (typeof candidates === 'string') {
    return candidates
      .split(',')
      .map(normalizeDomain)
      .filter(Boolean);
  }

  return [];
}

export class LuckyManager {
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
    this.luckyConfig = {
      apiBase: config.apiBase || getEnv('LUCKY_API_BASE', 'http://192.168.9.2:16601/666'),
      openToken: config.openToken || getEnv('LUCKY_OPEN_TOKEN', ''),
      httpsPort: parseInt(`${config.httpsPort || getEnv('LUCKY_HTTPS_PORT', '55000')}`, 10),
      instances: Array.isArray(config.instances) ? config.instances : undefined
    };
    this.luckyLanHost = this.resolveLuckyLanHost();
    this.sslApi = {
      getSSLList,
      applyACMECert
    };
  }

  /**
   * 初始化模块
   */
  async init() {
    console.log('[LuckyManager] 初始化Lucky管理模块...');

    if (!this.stateManager.state.lucky) {
      this.stateManager.state.lucky = {
        lastSync: null,
        proxies: {},
        syncStatus: {},
        ddnsTasks: [],
        ddnsLastReconcile: null
      };
    } else if (!this.stateManager.state.lucky.syncStatus) {
      this.stateManager.state.lucky.syncStatus = {};
    }

    // 初始化 DDNS 相关状态
    if (!this.stateManager.state.lucky.ddnsTasks) {
      this.stateManager.state.lucky.ddnsTasks = [];
    }

    console.log('[LuckyManager] ✅ Lucky管理模块初始化完成');
  }

  /**
   * 计算配置的 Hash 值
   */
  calculateHash(proxy) {
    const data = `${proxy.remark}|${proxy.domains?.join(',') || ''}|${proxy.target || ''}|${proxy.enabled}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * 获取 Lucky 局域网 IP（供 SunPanel 使用）
   */
  getLanHost() {
    return this.luckyLanHost;
  }

  resolveLuckyLanHost() {
    const envLanHost = getEnv('LUCKY_LAN_IP', '').trim();
    if (envLanHost) {
      return stripIPv6Brackets(envLanHost);
    }

    const candidates = [
      this.luckyConfig.apiBase,
      getEnv('SUNPANEL_API_BASE', '')
    ];

    for (const candidate of candidates) {
      const host = extractUrlHost(candidate);
      if (host && !isLoopbackHost(host) && isPrivateHost(host)) {
        return host;
      }
    }

    return null;
  }

  async getLuckyProxies() {
    try {
      const instances = this.luckyConfig.instances || [this.luckyConfig];
      const mainConfig = { ...this.luckyConfig, ...instances[0] };
      const proxies = await getAllProxies(mainConfig);
      return proxies.map(p => ({
        port: p.port,
        ruleKey: p.ruleKey,
        remark: p.remark,
        domains: p.domains,
        target: p.target,
        enableTLS: p.enableTLS,
        enabled: p.enabled,
        hash: this.calculateHash({
          remark: p.remark,
          domains: p.domains,
          target: p.target,
          enabled: p.enabled
        })
      }));
    } catch (error) {
      console.error('[LuckyManager] ❌ 获取Lucky代理失败:', error.message);
      return [];
    }
  }

  /**
   * 同步服务清单到Lucky
   * @param {Array} services - 服务列表
   * @param {object} ipv6Map - IPv6地址映射
   */
  async syncServicesToLucky(services, ipv6Map = {}) {
    console.log('[LuckyManager] 🔄 开始同步服务到Lucky实例...');

    const instances = this.luckyConfig.instances || [this.luckyConfig];
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      deleted: 0,
      details: []
    };

    for (let i = 0; i < instances.length; i++) {
      const instanceConfig = { ...this.luckyConfig, ...instances[i] };
      console.log(`[LuckyManager] ➡️ 正在同步到 Lucky 实例 ${i + 1} (${instanceConfig.apiBase})`);

      const luckyProxies = await this.getLuckyProxies();
      const serviceDomains = new Set(services.filter(s => s.enableProxy).map(s => s.proxyDomain));

      for (const proxy of luckyProxies) {
        const domain = proxy.domains[0];
        if (domain && !serviceDomains.has(domain)) {
          try {
            console.log(`[LuckyManager] 🗑️  [实例 ${i+1}] 删除不存在的服务: ${proxy.remark} (${domain})`);
            const deleteResult = await deleteSubRuleByDomain(proxy.ruleKey, domain, instanceConfig);
            if (deleteResult.deleted) {
              if (i === 0) results.deleted++;
              results.details.push({ service: proxy.remark, instance: i, action: 'deleted', domain });
              console.log(`[LuckyManager] ✅ [实例 ${i+1}] 成功删除: ${proxy.remark} (${domain})`);
            } else {
              console.error(`[LuckyManager] ❌ [实例 ${i+1}] 删除失败: ${proxy.remark} - ${deleteResult.msg}`);
            }
          } catch (error) {
            console.error(`[LuckyManager] ❌ [实例 ${i+1}] 删除规则失败: ${proxy.remark} - ${error.message}`);
          }
        }
      }

      for (const service of services) {
        if (!service.enableProxy) {
          if (i === 0) results.skipped++;
          continue;
        }

        try {
          const deviceIPv6 = ipv6Map[service.device] || null;
          const targetHost = deviceIPv6 || `192.168.9.${service.device}`;
          const formattedTargetHost = formatTargetHost(targetHost);
          const protocol = service.internalProtocol || 'http';
          const target = `${protocol}://${formattedTargetHost}:${service.internalPort}`;

          if (i === 0 && service.lucky.port !== 55000) {
            console.warn(`[LuckyManager] ⚠️  服务 ${service.id} 未使用统一的55000端口，当前端口: ${service.lucky.port}`);
          }

          const result = await smartAddOrUpdateSubRule(
            instanceConfig.httpsPort,
            service.lucky.remark || service.name,
            service.proxyType,
            [service.proxyDomain],
            [target],
            { enable: true, tls: service.enableTLS },
            instanceConfig
          );

          if (result.ret === 0) {
            if (i === 0) results.success++;
            results.details.push({ service: service.id, instance: i, action: result.action, domain: service.proxyDomain });
            console.log(`[LuckyManager] ✅ [实例 ${i+1}] ${result.action}: ${service.name} (${service.proxyDomain})`);
          } else {
            if (i === 0) results.failed++;
            console.error(`[LuckyManager] ❌ [实例 ${i+1}] 同步失败: ${service.name} - ${result.msg}`);
          }
        } catch (error) {
          if (i === 0) results.failed++;
          console.error(`[LuckyManager] ❌ [实例 ${i+1}] 同步异常: ${service.name} - ${error.message}`);
        }
      }
    }

    this.stateManager.state.lucky.lastSync = new Date().toISOString();
    await this.stateManager.save();
    console.log(`[LuckyManager] 🎉 所有实例同步完成 (成功: ${results.success}, 删除: ${results.deleted}, 失败: ${results.failed}).`);
    return results;
  }

  async ensureManagedDomainCertificates(proxyDefaults = {}) {
    try {
      const configuredDomains = proxyDefaults?.dns?.sslCertDomains;
      const targetDomains = Array.isArray(configuredDomains)
        ? [...new Set(configuredDomains.map(normalizeDomain).filter(Boolean))]
        : [];

      if (targetDomains.length === 0) {
        return {
          success: 0,
          failed: 0,
          skipped: 1,
          details: [{ action: 'skipped', reason: 'no_ssl_cert_domains' }]
        };
      }

      const email = getEnv('LUCKY_ACME_EMAIL', '').trim();
      const dnsId = getEnv('ALIYUN_AK', '').trim();
      const dnsSecret = getEnv('ALIYUN_SK', '').trim();

      if (!email || !dnsId || !dnsSecret) {
        return {
          success: 0,
          failed: 1,
          skipped: 0,
          error: 'missing_credentials',
          details: [{
            action: 'failed',
            reason: 'missing_credentials',
            missing: {
              LUCKY_ACME_EMAIL: !email,
              ALIYUN_AK: !dnsId,
              ALIYUN_SK: !dnsSecret
            }
          }]
        };
      }

      const instances = this.luckyConfig.instances || [this.luckyConfig];
      const results = {
        success: 0,
        failed: 0,
        skipped: 0,
        details: []
      };

      for (let i = 0; i < instances.length; i++) {
        const instanceConfig = { ...this.luckyConfig, ...instances[i] };
        const listResult = await this.sslApi.getSSLList(instanceConfig);

        if (listResult?.ret !== 0) {
          results.failed++;
          results.details.push({
            instance: i,
            action: 'failed',
            reason: 'ssl_list_failed',
            error: listResult?.msg || 'unknown_error'
          });
          continue;
        }

        const certDomains = (listResult?.list || []).flatMap(extractCertDomains);
        const missingDomains = targetDomains.filter((domain) => !certDomains.some((certDomain) => doesCertDomainCoverTarget(certDomain, domain)));

        if (missingDomains.length === 0) {
          results.skipped++;
          results.details.push({
            instance: i,
            action: 'skipped',
            reason: 'already_covered',
            domains: targetDomains
          });
          continue;
        }

        const applyResult = await this.sslApi.applyACMECert({
          remark: `managed-domains-${new Date().toISOString()}`,
          domains: missingDomains,
          email,
          dnsProvider: 'alidns',
          dnsId,
          dnsSecret
        }, instanceConfig);

        if (applyResult?.ret === 0) {
          results.success++;
          results.details.push({
            instance: i,
            action: 'applied',
            domains: missingDomains,
            message: applyResult?.msg || 'ok'
          });
        } else {
          results.failed++;
          results.details.push({
            instance: i,
            action: 'failed',
            reason: 'ssl_apply_failed',
            domains: missingDomains,
            error: applyResult?.msg || 'unknown_error'
          });
        }
      }

      return results;
    } catch (error) {
      return {
        success: 0,
        failed: 1,
        skipped: 0,
        error: error?.message || String(error),
        details: [{ action: 'failed', reason: 'unexpected_error' }]
      };
    }
  }

  // ── Lucky DDNS 管理 ──

  /**
   * 获取用于调用 lucky-ddns 函数的 config 对象
   */
  getLuckyDDNSConfig() {
    return {
      apiBase: this.luckyConfig.apiBase,
      openToken: this.luckyConfig.openToken
    };
  }

  /**
   * 根据配置生成期望的 DDNS 任务列表
   * @returns {Array<{taskName: string, domain: string, deviceId: string, fullDomainName: string}>}
   */
  buildDesiredDDNSTasks() {
    const ddnsConfig = this.config.ddnsConfig || {};
    const devices = ddnsConfig.devices || [];
    const domains = ddnsConfig.domains || [getEnv('ALIYUN_DOMAIN', 'leecaiy.shop')];

    const tasks = [];
    for (const deviceId of devices) {
      for (const domain of domains) {
        tasks.push({
          taskName: `ddns-${deviceId}-v6-${domain}`,
          domain,
          deviceId,
          fullDomainName: `${deviceId}.v6.${domain}`
        });
      }
    }
    return tasks;
  }

  /**
   * 调和 DDNS 任务：创建缺失的，删除孤立的
   * @returns {Promise<{created: number, removed: number, unchanged: number, errors: string[]}>}
   */
  async reconcileDDNSTasks() {
    const desired = this.buildDesiredDDNSTasks();
    const config = this.getLuckyDDNSConfig();
    const dns = buildAliyunDNSCredentials();
    const intervals = this.config.ddnsConfig?.intervals || 36;

    console.log(`[LuckyManager] 🔄 DDNS 任务调和: ${desired.length} 个期望任务`);

    // 获取 Lucky 中现有的 DDNS 任务
    let existingTasks = [];
    try {
      const existingResult = await getDDNSTaskList(config);
      if (existingResult.ret !== 0) {
        throw new Error(existingResult.msg || '获取 DDNS 任务列表失败');
      }
      existingTasks = existingResult.data || existingResult.list || [];
    } catch (error) {
      console.error(`[LuckyManager] ❌ 获取 DDNS 任务列表失败: ${error.message}`);
      return { created: 0, removed: 0, unchanged: 0, errors: [error.message] };
    }

    const existingNames = new Map();
    for (const t of existingTasks) {
      existingNames.set(t.TaskName, t);
    }
    const desiredNames = new Set(desired.map(d => d.taskName));

    const results = { created: 0, removed: 0, unchanged: 0, errors: [] };

    // 创建缺失的任务
    for (const task of desired) {
      if (!existingNames.has(task.taskName)) {
        try {
          await createDDNSTask({
            taskName: task.taskName,
            taskType: 'IPv6',
            dns,
            records: [buildRecord(task.fullDomainName, 'AAAA')],
            intervals
          }, config);
          results.created++;
          console.log(`[LuckyManager] ✅ 创建 DDNS 任务: ${task.taskName}`);
        } catch (err) {
          results.errors.push(`创建 ${task.taskName}: ${err.message}`);
          console.error(`[LuckyManager] ❌ 创建 DDNS 任务失败: ${task.taskName} - ${err.message}`);
        }
      } else {
        results.unchanged++;
      }
    }

    // 删除孤立的（仅删除 ddns- 前缀且不再期望的任务）
    for (const [name, existing] of existingNames) {
      if (name.startsWith('ddns-') && !desiredNames.has(name)) {
        try {
          await deleteDDNSTask(existing.TaskKey, config);
          results.removed++;
          console.log(`[LuckyManager] 🗑️  删除孤立 DDNS 任务: ${name}`);
        } catch (err) {
          results.errors.push(`删除 ${name}: ${err.message}`);
          console.error(`[LuckyManager] ❌ 删除 DDNS 任务失败: ${name} - ${err.message}`);
        }
      }
    }

    // 更新状态
    this.stateManager.state.lucky.ddnsTasks = desired.map(d => d.taskName);
    this.stateManager.state.lucky.ddnsLastReconcile = new Date().toISOString();
    await this.stateManager.save();

    console.log(`[LuckyManager] 🎉 DDNS 调和完成 (创建: ${results.created}, 删除: ${results.removed}, 未变: ${results.unchanged})`);
    return results;
  }

  /**
   * 获取所有 DDNS 任务状态
   */
  async getDDNSTaskStatus() {
    const config = this.getLuckyDDNSConfig();
    try {
      const result = await getDDNSTaskList(config);
      if (result.ret !== 0) {
        return { success: false, error: result.msg, tasks: [] };
      }
      return {
        success: true,
        total: (result.data || result.list || []).length,
        tasks: (result.data || result.list || []).map(t => ({
          taskKey: t.TaskKey,
          taskName: t.TaskName,
          enabled: t.Enable,
          type: t.TaskType,
          intervals: t.Intervals,
          ipv6Addr: t.Ipv6Addr || null,
          lastSync: t.LastSyncTime || null,
          nextSync: t.NextSyncTime || null,
          querying: t.QueryingIPv6Addr || false,
          records: (t.Records || []).map(r =>
            r.SyncRecordData?.fullDomainName
              || (r.SubDomain && r.DomainName ? `${r.SubDomain}.${r.DomainName}` : null)
          )
        }))
      };
    } catch (error) {
      return { success: false, error: error.message, tasks: [] };
    }
  }

  /**
   * 手动触发指定 DDNS 任务同步
   */
  async syncDDNSTask(taskKey) {
    const config = this.getLuckyDDNSConfig();
    return await manualSyncDDNS(taskKey, config);
  }

  /**
   * 获取 Lucky DDNS 日志
   */
  async getDDNSLogList(page = 1, pageSize = 20) {
    const config = this.getLuckyDDNSConfig();
    return await getDDNSLogs(page, pageSize, config);
  }

  /**
   * 获取状态摘要
   */
  getStatus() {
    return {
      lastSync: this.stateManager.state.lucky?.lastSync || null,
      enabled: this.config.enabled,
      port: this.luckyConfig.httpsPort,
      proxyCount: Object.keys(this.stateManager.state.lucky?.syncStatus || {}).length,
      ddnsTasks: this.stateManager.state.lucky?.ddnsTasks || [],
      ddnsLastReconcile: this.stateManager.state.lucky?.ddnsLastReconcile || null
    };
  }

  /**
   * 清空 Lucky 反向代理规则
   * @returns {object} 清理结果
   */
  async purgeLucky() {
    try {
      const instances = this.luckyConfig.instances || [this.luckyConfig];
      const results = [];
      let totalDeleted = 0;

      for (let i = 0; i < instances.length; i++) {
        const instanceConfig = { ...this.luckyConfig, ...instances[i] };
        const instanceResult = {
          instance: i + 1,
          apiBase: instanceConfig.apiBase,
          deleted: 0,
          failed: 0,
          errors: []
        };

        try {
          const ports = await listAllPorts(instanceConfig);
          const proxyPort = instanceConfig.httpsPort || 55000;
          const proxyPorts = ports.filter(p => p.port === proxyPort);

          for (const port of proxyPorts) {
            try {
              const result = await deletePort(port.port, instanceConfig);
              if (result.ret === 0) {
                instanceResult.deleted++;
                totalDeleted++;
                console.log(`[LuckyManager] ✅ [实例 ${i+1}] 已删除端口 ${port.port} (${port.name})`);
              } else {
                instanceResult.failed++;
                instanceResult.errors.push(`端口 ${port.port}: ${result.msg}`);
                console.error(`[LuckyManager] ❌ [实例 ${i+1}] 删除端口 ${port.port} 失败: ${result.msg}`);
              }
            } catch (error) {
              instanceResult.failed++;
              instanceResult.errors.push(`端口 ${port.port}: ${error.message}`);
              console.error(`[LuckyManager] ❌ [实例 ${i+1}] 删除端口 ${port.port} 异常: ${error.message}`);
            }
          }

          if (proxyPorts.length === 0) {
            console.log(`[LuckyManager] ℹ️  [实例 ${i+1}] 没有找到端口 ${proxyPort} 的规则`);
          }
        } catch (error) {
          instanceResult.errors.push(`获取端口列表失败: ${error.message}`);
          console.error(`[LuckyManager] ❌ [实例 ${i+1}] 获取端口列表失败: ${error.message}`);
        }

        results.push(instanceResult);
      }

      this.stateManager.state.lucky.syncStatus = {};
      this.stateManager.state.lucky.lastSync = null;
      await this.stateManager.save();

      return {
        success: totalDeleted > 0,
        totalDeleted,
        instances: results,
        message: totalDeleted > 0
          ? `已删除 ${totalDeleted} 个 Lucky 反向代理规则`
          : '没有找到可删除的 Lucky 反向代理规则'
      };
    } catch (error) {
      console.error('[LuckyManager] ❌ 清空 Lucky 数据失败:', error.message);
      throw error;
    }
  }
}

export default LuckyManager;
