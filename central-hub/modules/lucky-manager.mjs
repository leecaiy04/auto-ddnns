/**
 * Lucky 管理模块
 * 负责管理 Lucky 反向代理，并同步到 SunPanel
 */

import crypto from 'crypto';
import {
  getAllProxies,
  smartAddOrUpdateSubRule,
  listAllPorts
} from '../../lib/api-clients/lucky-port-manager.mjs';
import {
  getGroupList,
  createGroup,
  createItem,
  updateItem,
  getItemInfo
} from '../../lib/api-clients/sunpanel-api.mjs';
import { getEnv } from '../../lib/utils/env-loader.mjs';

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

function buildUrlString(protocol, host, port, pathname = '', search = '', hash = '') {
  const formattedHost = formatTargetHost(host);
  const shouldAppendPort = Boolean(port);
  const base = `${protocol}//${formattedHost}${shouldAppendPort ? `:${port}` : ''}`;
  const suffix = pathname === '/' && !search && !hash ? '' : `${pathname || ''}${search || ''}${hash || ''}`;
  return `${base}${suffix}`;
}

function hasExplicitPortInUrl(value) {
  try {
    const parsed = new URL(value);
    const authority = value.slice(parsed.protocol.length + 2).split(/[/?#]/, 1)[0];

    if (authority.startsWith('[')) {
      return /^\[[^\]]+\]:\d+$/.test(authority);
    }

    return /^[^:]+:\d+$/.test(authority);
  } catch {
    return false;
  }
}

function isSunPanelIconFetchError(error) {
  return typeof error?.message === 'string' &&
    error.message.includes('failed to save icon file');
}

async function syncSunPanelCard(upsert, cardConfig) {
  try {
    return await upsert(cardConfig);
  } catch (error) {
    if (!isSunPanelIconFetchError(error)) {
      throw error;
    }

    try {
      return await upsert({
        ...cardConfig,
        isSaveIcon: false
      });
    } catch (fallbackError) {
      if (!isSunPanelIconFetchError(fallbackError)) {
        throw fallbackError;
      }

      return await upsert({
        ...cardConfig,
        iconUrl: '',
        isSaveIcon: false
      });
    }
  }
}

export class LuckyManager {
  constructor(config, stateManager, sunpanelModuleConfig = null) {
    this.config = config;
    this.stateManager = stateManager;
    this.luckyConfig = {
      apiBase: config.apiBase || getEnv('LUCKY_API_BASE', 'http://192.168.3.200:16601'),
      openToken: config.openToken || getEnv('LUCKY_OPEN_TOKEN', ''),
      httpsPort: parseInt(`${config.httpsPort || getEnv('LUCKY_HTTPS_PORT', '50000')}`, 10)
    };
    this.sunpanelConfig = {
      apiBase: sunpanelModuleConfig?.apiBase || getEnv('SUNPANEL_API_BASE', 'http://192.168.3.200:20001/openapi/v1'),
      apiToken: sunpanelModuleConfig?.apiToken || getEnv('SUNPANEL_API_TOKEN', '')
    };
    this.luckyLanHost = this.resolveLuckyLanHost();
  }

  /**
   * 初始化模块
   */
  async init() {
    console.log('[LuckyManager] 初始化Lucky管理模块...');

    // 初始化状态
    if (!this.stateManager.state.lucky) {
      this.stateManager.state.lucky = {
        lastSync: null,
        proxies: {},
        syncStatus: {}
      };
    } else if (!this.stateManager.state.lucky.syncStatus) {
      this.stateManager.state.lucky.syncStatus = {};
    }

    if (!this.stateManager.state.sunpanel) {
      this.stateManager.state.sunpanel = {
        lastSync: null,
        cards: {},
        groups: {},
        syncStatus: {}
      };
    } else if (!this.stateManager.state.sunpanel.syncStatus) {
      this.stateManager.state.sunpanel.syncStatus = {};
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

  calculateSunPanelHash(proxy, cardConfig) {
    const data = JSON.stringify({
      port: proxy.port,
      enabled: proxy.enabled,
      title: cardConfig.title,
      url: cardConfig.url,
      lanUrl: cardConfig.lanUrl,
      iconUrl: cardConfig.iconUrl,
      group: cardConfig.itemGroupOnlyName
    });

    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * 从域名生成 onlyName
   */
  generateOnlyName(domain) {
    return domain
      .replace(/^https?:\/\//, '')
      .replace(/[\/:]/g, '-')
      .replace(/\./g, '-')
      .toLowerCase();
  }

  resolveLuckyLanHost() {
    const envLanHost = getEnv('LUCKY_LAN_IP', '').trim();
    if (envLanHost) {
      return stripIPv6Brackets(envLanHost);
    }

    const candidates = [
      this.sunpanelConfig.apiBase,
      this.luckyConfig.apiBase
    ];

    for (const candidate of candidates) {
      const host = extractUrlHost(candidate);
      if (host && !isLoopbackHost(host) && isPrivateHost(host)) {
        return host;
      }
    }

    return null;
  }

  buildSunPanelPublicUrl(proxy, domain) {
    const scheme = proxy.enableTLS === false ? 'http' : 'https';
    const defaultPort = scheme === 'https' ? 443 : 80;
    const port = proxy.port && proxy.port !== defaultPort ? proxy.port : '';
    return buildUrlString(`${scheme}:`, domain, port);
  }

  buildSunPanelLanUrl(target) {
    if (!target) return '';

    try {
      const parsed = new URL(target);
      const hasExplicitPort = hasExplicitPortInUrl(target);
      const host = stripIPv6Brackets(parsed.hostname);
      const resolvedHost = isLoopbackHost(host) && this.luckyLanHost
        ? this.luckyLanHost
        : host;
      const port = parsed.port || (
        hasExplicitPort
          ? (parsed.protocol === 'https:' ? '443' : parsed.protocol === 'http:' ? '80' : '')
          : ''
      );

      return buildUrlString(
        parsed.protocol,
        resolvedHost,
        port,
        parsed.pathname,
        parsed.search,
        parsed.hash
      );
    } catch {
      return target;
    }
  }

  buildGroupOnlyName(groupName) {
    return String(groupName || '其他').trim().toLowerCase().replace(/\s+/g, '-');
  }

  getServiceByDomain(services, domain) {
    return services.find(service => service.proxyDomain === domain) || null;
  }

  async getLuckyProxies() {
    try {
      const proxies = await getAllProxies(this.luckyConfig);
      return proxies.map(p => ({
        port: p.port,
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
    console.log('[LuckyManager] 🔄 开始同步服务到Lucky...');

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      details: []
    };

    for (const service of services) {
      if (!service.enableProxy) {
        results.skipped++;
        continue;
      }

      try {
        // 获取设备的IPv6地址
        const deviceIPv6 = ipv6Map[service.device] || null;

        // 构建目标地址
        const targetHost = deviceIPv6 || `192.168.3.${service.device}`;
        const formattedTargetHost = formatTargetHost(targetHost);
        const target = service.enableTLS
          ? `https://${formattedTargetHost}:${service.internalPort}`
          : `http://${formattedTargetHost}:${service.internalPort}`;

        // 检查是否需要使用50000端口
        if (service.lucky.port !== 50000) {
          console.warn(`[LuckyManager] ⚠️  服务 ${service.id} 未使用统一的50000端口，当前端口: ${service.lucky.port}`);
        }

        // 使用智能添加/更新子规则
        const result = await smartAddOrUpdateSubRule(
          this.luckyConfig.httpsPort,
          service.lucky.remark || service.name,
          service.proxyType,
          [service.proxyDomain],
          [target],
          {
            enable: true,
            tls: service.enableTLS
          },
          this.luckyConfig
        );

        if (result.ret === 0) {
          results.success++;
          results.details.push({
            service: service.id,
            action: result.action,
            domain: service.proxyDomain,
            target
          });
          console.log(`[LuckyManager] ✅ ${result.action}: ${service.name} (${service.proxyDomain})`);
        } else {
          results.failed++;
          console.error(`[LuckyManager] ❌ 同步失败: ${service.name} - ${result.msg}`);
          results.details.push({
            service: service.id,
            action: 'failed',
            error: result.msg
          });
        }
      } catch (error) {
        results.failed++;
        console.error(`[LuckyManager] ❌ 同步异常: ${service.name} - ${error.message}`);
        results.details.push({
          service: service.id,
          action: 'error',
          error: error.message
        });
      }
    }

    // 更新状态
    this.stateManager.state.lucky.lastSync = new Date().toISOString();
    await this.stateManager.save();

    console.log(`[LuckyManager] 🎉 同步完成: 成功 ${results.success}, 失败 ${results.failed}, 跳过 ${results.skipped}`);

    return results;
  }

  /**
   * 同步Lucky代理到SunPanel
   */
  async syncToSunPanel(services = []) {
    console.log('[LuckyManager] 🔄 开始同步Lucky到SunPanel...');

    try {
      const luckyProxies = await this.getLuckyProxies();
      const groupsData = await getGroupList(this.sunpanelConfig);
      const groups = groupsData.list || [];

      const groupMap = new Map();
      groups.forEach(group => groupMap.set(group.onlyName, group.itemGroupID));

      const defaultGroups = ['NAS', '服务器', '其他'];
      for (const groupName of defaultGroups) {
        const onlyName = this.buildGroupOnlyName(groupName);
        if (!groupMap.has(onlyName)) {
          try {
            const result = await createGroup({ title: groupName, onlyName }, this.sunpanelConfig);
            groupMap.set(onlyName, result.itemGroupID);
            console.log(`[LuckyManager] ✅ 创建分组: ${groupName}`);
          } catch (error) {
            if (!error.message.includes('1202')) {
              console.error(`[LuckyManager] ⚠️  创建分组失败: ${groupName} - ${error.message}`);
            }
          }
        }
      }

      const results = {
        success: 0,
        failed: 0,
        updated: 0,
        details: []
      };

      for (const proxy of luckyProxies) {
        try {
          const domain = proxy.domains[0];
          if (!domain) continue;

          const matchedService = this.getServiceByDomain(services, domain);
          const configuredGroupName = matchedService?.sunpanel?.group || '其他';
          const groupOnlyName = this.buildGroupOnlyName(configuredGroupName);
          const groupId = groupMap.get(groupOnlyName);

          if (!groupId) {
            console.warn(`[LuckyManager] ⚠️  分组不存在: ${configuredGroupName}`);
            continue;
          }

          const publicUrl = this.buildSunPanelPublicUrl(proxy, domain);
          const lanUrl = matchedService?.sunpanel?.lanUrl || this.buildSunPanelLanUrl(proxy.target);
          const iconUrl = matchedService?.sunpanel?.icon || `https://${domain}/favicon.ico`;
          const onlyName = matchedService
            ? `svc-${matchedService.id}`
            : this.generateOnlyName(domain);

          const finalCardConfig = matchedService
            ? {
                title: matchedService.name,
                url: publicUrl,
                onlyName,
                iconUrl,
                lanUrl,
                description: matchedService.description,
                itemGroupID: groupId,
                itemGroupOnlyName: groupOnlyName,
                isSaveIcon: false
              }
            : {
                title: proxy.remark || domain,
                url: publicUrl,
                onlyName,
                iconUrl,
                lanUrl,
                description: proxy.remark || `反向代理: ${domain}`,
                itemGroupID: groupId,
                itemGroupOnlyName: groupOnlyName,
                isSaveIcon: true
              };

          const hash = this.calculateSunPanelHash(proxy, finalCardConfig);
          const currentState = this.stateManager.state.sunpanel.syncStatus[onlyName];

          if (currentState && currentState.hash === hash) {
            results.details.push({ domain, action: 'skipped', reason: 'hash_unchanged' });
            continue;
          }

          let action = 'created';
          try {
            await getItemInfo(onlyName, this.sunpanelConfig);
            await syncSunPanelCard(
              (payload) => updateItem({ onlyName, ...payload }, this.sunpanelConfig),
              finalCardConfig
            );
            action = 'updated';
          } catch (error) {
            if (error.message.includes('1203')) {
              await syncSunPanelCard(
                (cardPayload) => createItem(cardPayload, this.sunpanelConfig),
                finalCardConfig
              );
            } else {
              throw error;
            }
          }

          results.success++;
          if (action === 'updated') results.updated++;

          this.stateManager.state.sunpanel.syncStatus[onlyName] = {
            hash,
            domain,
            remark: proxy.remark,
            target: proxy.target,
            serviceId: matchedService?.id || null,
            groupId,
            groupOnlyName,
            lastSync: new Date().toISOString()
          };

          console.log(`[LuckyManager] ✅ ${action === 'created' ? '创建' : '更新'}卡片: ${finalCardConfig.title}`);
        } catch (error) {
          results.failed++;
          console.error(`[LuckyManager] ❌ 同步失败: ${proxy.domains[0]} - ${error.message}`);
          results.details.push({
            domain: proxy.domains[0],
            action: 'error',
            error: error.message
          });
        }
      }

      this.stateManager.state.sunpanel.lastSync = new Date().toISOString();
      await this.stateManager.save();

      console.log(`[LuckyManager] 🎉 SunPanel同步完成: 成功 ${results.success}, 更新 ${results.updated}, 失败 ${results.failed}`);

      return results;
    } catch (error) {
      console.error('[LuckyManager] ❌ 同步到SunPanel失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取状态摘要
   */
  getStatus() {
    return {
      lucky: {
        lastSync: this.stateManager.state.lucky?.lastSync || null,
        enabled: this.config.enabled,
        port: this.luckyConfig.httpsPort,
        proxyCount: Object.keys(this.stateManager.state.lucky?.syncStatus || {}).length
      },
      sunpanel: {
        lastSync: this.stateManager.state.sunpanel?.lastSync || null,
        cardsCount: Object.keys(this.stateManager.state.sunpanel?.syncStatus || {}).length
      }
    };
  }
}

export default LuckyManager;
