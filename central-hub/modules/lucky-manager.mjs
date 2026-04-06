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
  deletePort
} from '../../lib/api-clients/lucky-reverseproxy.mjs';
import {
  getLuckyAuthConfig
} from '../../lib/api-clients/lucky-api.mjs';
import {
  getSunPanelAuthConfig,
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

function resolveLuckyTargetHost(service, ipv6Map = {}) {
  return `192.168.3.${service.device}`;
}

function buildLuckyTarget(service, targetHost) {
  const formattedTargetHost = formatTargetHost(targetHost);
  const targetProtocol = service.internalProtocol || 'http';
  return `${targetProtocol}://${formattedTargetHost}:${service.internalPort}`;
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
      openToken: config.openToken || config.token || getEnv('LUCKY_OPEN_TOKEN', ''),
      adminToken: config.adminToken || getEnv('LUCKY_ADMIN_TOKEN', ''),
      httpsPort: parseInt(`${config.httpsPort || getEnv('LUCKY_HTTPS_PORT', '50000')}`, 10),
      instances: Array.isArray(config.instances) ? config.instances : []
    };
    this.sunpanelConfig = {
      apiBase: sunpanelModuleConfig?.apiBase || getEnv('SUNPANEL_API_BASE', 'http://192.168.3.200:20001/openapi/v1'),
      apiToken: sunpanelModuleConfig?.apiToken || getEnv('SUNPANEL_API_TOKEN', ''),
      instances: Array.isArray(sunpanelModuleConfig?.instances) ? sunpanelModuleConfig.instances : []
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

  getNormalizedLuckyInstances() {
    const instances = this.luckyConfig.instances?.length ? this.luckyConfig.instances : [this.luckyConfig];
    return instances.map(instance => ({
      ...this.luckyConfig,
      ...instance,
      openToken: instance.openToken || instance.token || this.luckyConfig.openToken || '',
      adminToken: instance.adminToken || this.luckyConfig.adminToken || '',
      httpsPort: parseInt(`${instance.httpsPort || this.luckyConfig.httpsPort || 50000}`, 10)
    }));
  }

  getNormalizedSunPanelInstances() {
    const instances = this.sunpanelConfig.instances?.length ? this.sunpanelConfig.instances : [this.sunpanelConfig];
    return instances.map(instance => ({
      ...this.sunpanelConfig,
      ...instance,
      apiToken: instance.apiToken || this.sunpanelConfig.apiToken || ''
    }));
  }

  logLuckyAuth(instanceConfig, index) {
    const auth = getLuckyAuthConfig(instanceConfig);
    console.log(`[LuckyManager] 🔐 Lucky 实例 ${index + 1} 鉴权: apiBase=${auth.apiBase} authMode=${auth.authMode} hasOpenToken=${auth.hasOpenToken} hasAdminToken=${auth.hasAdminToken}`);
    return auth;
  }

  logSunPanelAuth(instanceConfig, index) {
    const auth = getSunPanelAuthConfig(instanceConfig);
    console.log(`[LuckyManager] 🔐 SunPanel 实例 ${index + 1} 鉴权: apiBase=${auth.apiBase} hasToken=${auth.hasToken}`);
    return auth;
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
      const instances = this.getNormalizedLuckyInstances();
      const mainConfig = instances[0];
      this.logLuckyAuth(mainConfig, 0);
      const proxies = await getAllProxies(mainConfig);
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

  getManagedServices(services = []) {
    return Array.isArray(services)
      ? services.filter(service => service?.enableProxy)
      : [];
  }

  normalizeComparableValue(value) {
    return `${value ?? ''}`.trim();
  }

  buildDiffFields(expected = {}, actual = {}, fields = []) {
    return fields.filter(field => this.normalizeComparableValue(expected[field]) !== this.normalizeComparableValue(actual[field]));
  }

  buildExpectedLuckyEntry(service, ipv6Map = {}) {
    const targetHost = resolveLuckyTargetHost(service, ipv6Map);
    const target = buildLuckyTarget(service, targetHost);

    return {
      serviceId: service.id,
      name: service.name,
      domain: service.proxyDomain,
      expected: {
        remark: service.lucky?.remark || service.name,
        target,
        enabled: true,
        enableTLS: Boolean(service.enableTLS),
        port: service.lucky?.port || this.luckyConfig.httpsPort
      }
    };
  }

  getSunPanelOnlyName(service) {
    return `svc-${service.id}`;
  }

  buildExpectedSunPanelEntry(service) {
    const proxy = {
      enableTLS: service.enableTLS,
      port: service.lucky?.port || this.luckyConfig.httpsPort
    };
    const domain = service.proxyDomain;
    const lanProtocol = service.internalProtocol || (service.enableTLS ? 'https' : 'http');
    const lanUrl = service.sunpanel?.lanUrl || `${lanProtocol}://192.168.3.${service.device}:${service.internalPort}`;
    const publicUrl = this.buildSunPanelPublicUrl(proxy, domain);

    return {
      serviceId: service.id,
      name: service.name,
      domain,
      onlyName: this.getSunPanelOnlyName(service),
      expected: {
        title: service.name,
        url: publicUrl,
        lanUrl,
        iconUrl: '',
        groupOnlyName: this.buildGroupOnlyName(service.sunpanel?.group || '其他')
      }
    };
  }

  async getLuckyConsistencyStatus(services = [], ipv6Map = {}) {
    const managedServices = this.getManagedServices(services);

    try {
      const luckyProxies = await this.getLuckyProxies();
      const actualByDomain = new Map();
      for (const proxy of luckyProxies) {
        for (const domain of proxy.domains || []) {
          if (domain && !actualByDomain.has(domain)) {
            actualByDomain.set(domain, proxy);
          }
        }
      }

      const managedDomains = new Set(managedServices.map(service => service.proxyDomain).filter(Boolean));
      const managed = managedServices.map(service => {
        const entry = this.buildExpectedLuckyEntry(service, ipv6Map);
        const actualProxy = actualByDomain.get(entry.domain) || null;

        if (!actualProxy) {
          return {
            ...entry,
            status: 'missing',
            driftFields: [],
            actual: null
          };
        }

        const actual = {
          remark: actualProxy.remark,
          target: actualProxy.target,
          enabled: actualProxy.enabled,
          enableTLS: actualProxy.enableTLS,
          port: actualProxy.port
        };
        const driftFields = this.buildDiffFields(entry.expected, actual, ['remark', 'target', 'enabled', 'enableTLS', 'port']);

        return {
          ...entry,
          status: driftFields.length > 0 ? 'drift' : 'synced',
          driftFields,
          actual
        };
      });

      const extras = [];
      for (const proxy of luckyProxies) {
        for (const domain of proxy.domains || []) {
          if (!domain || managedDomains.has(domain)) {
            continue;
          }

          extras.push({
            domain,
            remark: proxy.remark,
            target: proxy.target,
            enabled: proxy.enabled,
            enableTLS: proxy.enableTLS,
            port: proxy.port
          });
        }
      }

      const summary = {
        managedCount: managed.length,
        actualCount: luckyProxies.length,
        syncedCount: managed.filter(item => item.status === 'synced').length,
        missingCount: managed.filter(item => item.status === 'missing').length,
        driftCount: managed.filter(item => item.status === 'drift').length,
        extraCount: extras.length,
        healthy: managed.every(item => item.status === 'synced')
      };

      return {
        success: true,
        type: 'lucky',
        sourceOfTruth: 'service-registry',
        generatedAt: new Date().toISOString(),
        summary,
        managed,
        extras
      };
    } catch (error) {
      return {
        success: false,
        type: 'lucky',
        sourceOfTruth: 'service-registry',
        generatedAt: new Date().toISOString(),
        error: error.message,
        summary: {
          managedCount: managedServices.length,
          actualCount: 0,
          syncedCount: 0,
          missingCount: 0,
          driftCount: 0,
          extraCount: 0,
          healthy: false
        },
        managed: [],
        extras: []
      };
    }
  }

  async getSunPanelConsistencyStatus(services = []) {
    const managedServices = this.getManagedServices(services);
    const expectedEntries = managedServices.map(service => this.buildExpectedSunPanelEntry(service));
    const trackedState = this.stateManager.state.sunpanel?.syncStatus || {};
    const managedOnlyNames = new Set(expectedEntries.map(entry => entry.onlyName));
    const staleState = Object.entries(trackedState)
      .filter(([key]) => !managedOnlyNames.has(key.replace(/_\d+$/, '')))
      .map(([key, value]) => ({
        key,
        onlyName: key.replace(/_\d+$/, ''),
        domain: value?.domain || null,
        serviceId: value?.serviceId || null,
        lastSync: value?.lastSync || null
      }));

    const instances = this.getNormalizedSunPanelInstances();
    const instanceConfig = instances[0];
    this.logSunPanelAuth(instanceConfig, 0);
    const managed = [];

    try {
      for (const entry of expectedEntries) {
        try {
          const remoteCard = await getItemInfo(entry.onlyName, instanceConfig);
          const actual = {
            title: remoteCard?.title || '',
            url: remoteCard?.url || '',
            lanUrl: remoteCard?.lanUrl || '',
            iconUrl: remoteCard?.iconUrl || '',
            groupOnlyName: remoteCard?.itemGroupOnlyName || ''
          };
          const driftFields = this.buildDiffFields(entry.expected, actual, ['title', 'url', 'lanUrl', 'iconUrl', 'groupOnlyName']);

          managed.push({
            ...entry,
            status: driftFields.length > 0 ? 'drift' : 'synced',
            driftFields,
            actual
          });
        } catch (error) {
          if (error.message.includes('1203')) {
            managed.push({
              ...entry,
              status: 'missing',
              driftFields: [],
              actual: null
            });
            continue;
          }

          managed.push({
            ...entry,
            status: 'error',
            driftFields: [],
            actual: null,
            error: error.message
          });
        }
      }

      const summary = {
        managedCount: managed.length,
        syncedCount: managed.filter(item => item.status === 'synced').length,
        missingCount: managed.filter(item => item.status === 'missing').length,
        driftCount: managed.filter(item => item.status === 'drift').length,
        errorCount: managed.filter(item => item.status === 'error').length,
        staleStateCount: staleState.length,
        extraDetectionSupported: false,
        healthy: managed.every(item => item.status === 'synced')
      };

      return {
        success: true,
        type: 'sunpanel',
        sourceOfTruth: 'service-registry',
        generatedAt: new Date().toISOString(),
        summary,
        managed,
        staleState,
        extras: {
          supported: false,
          items: [],
          note: 'SunPanel 当前客户端仅支持按 onlyName 查询，暂不支持列出全部远端卡片，因此无法识别远端 extra 项。'
        }
      };
    } catch (error) {
      return {
        success: false,
        type: 'sunpanel',
        sourceOfTruth: 'service-registry',
        generatedAt: new Date().toISOString(),
        error: error.message,
        summary: {
          managedCount: managedServices.length,
          syncedCount: 0,
          missingCount: 0,
          driftCount: 0,
          errorCount: 0,
          staleStateCount: staleState.length,
          extraDetectionSupported: false,
          healthy: false
        },
        managed: [],
        staleState,
        extras: {
          supported: false,
          items: [],
          note: 'SunPanel 当前客户端仅支持按 onlyName 查询，暂不支持列出全部远端卡片，因此无法识别远端 extra 项。'
        }
      };
    }
  }

  getState() {
    return {
      lastSync: this.stateManager.state.lucky?.lastSync || null,
      proxyCount: Object.keys(this.stateManager.state.lucky?.syncStatus || {}).length,
      proxies: Object.values(this.stateManager.state.lucky?.syncStatus || {}),
      sunpanelLastSync: this.stateManager.state.sunpanel?.lastSync || null,
      cardCount: Object.keys(this.stateManager.state.sunpanel?.syncStatus || {}).length
    };
  }

  getCards() {
    return Object.values(this.stateManager.state.sunpanel?.syncStatus || {});
  }

  /**
   * 同步服务清单到Lucky
   * @param {Array} services - 服务列表
   * @param {object} ipv6Map - 设备地址映射（当前内网回源统一使用 IPv4）
   */
  async syncServicesToLucky(services, ipv6Map = {}) {
    console.log('[LuckyManager] 🔄 开始同步服务到Lucky实例...');

    const instances = this.getNormalizedLuckyInstances();
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      details: []
    };

    for (let i = 0; i < instances.length; i++) {
      const instanceConfig = instances[i];
      this.logLuckyAuth(instanceConfig, i);
      console.log(`[LuckyManager] ➡️ 正在同步到 Lucky 实例 ${i + 1} (${instanceConfig.apiBase})`);

      for (const service of services) {
        if (!service.enableProxy) {
          if (i === 0) results.skipped++;
          continue;
        }

        try {
          const targetHost = resolveLuckyTargetHost(service, ipv6Map);
          const target = buildLuckyTarget(service, targetHost);

          const publicPort = service.lucky?.port || instanceConfig.httpsPort;

          if (i === 0 && service.lucky?.port && service.lucky.port !== instanceConfig.httpsPort) {
            console.warn(`[LuckyManager] ⚠️  服务 ${service.id} 使用独立公网端口: ${service.lucky.port} (实例默认端口 ${instanceConfig.httpsPort})`);
          }

          const result = await smartAddOrUpdateSubRule(
            publicPort,
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
    console.log('[LuckyManager] 🎉 所有实例同步完成.');
    return results;
  }

  /**
   * 同步Lucky代理到SunPanel
   */
  async syncToSunPanel(services = []) {
    console.log('[LuckyManager] 🔄 开始同步Lucky到SunPanel实例...');

    try {
      const luckyProxies = await this.getLuckyProxies();
      const instances = this.getNormalizedSunPanelInstances();
      const results = { success: 0, failed: 0, updated: 0, details: [] };

      for (let i = 0; i < instances.length; i++) {
        const instanceConfig = instances[i];
        this.logSunPanelAuth(instanceConfig, i);
        console.log(`[LuckyManager] ➡️ 正在同步到 SunPanel 实例 ${i + 1} (${instanceConfig.apiBase})`);

        const groupsData = await getGroupList(instanceConfig);
        const groups = groupsData.list || [];
        const groupMap = new Map();
        groups.forEach(group => groupMap.set(group.onlyName, group.itemGroupID));

        const defaultGroups = ['NAS', '服务器', '其他'];
        const requiredGroups = new Set(defaultGroups);
        services.forEach(service => {
          const groupName = service?.sunpanel?.group;
          if (groupName) {
            requiredGroups.add(groupName);
          }
        });

        for (const groupName of requiredGroups) {
          const onlyName = this.buildGroupOnlyName(groupName);
          if (!groupMap.has(onlyName)) {
            try {
              const createdGroup = await createGroup({ title: groupName, onlyName }, instanceConfig);
              let groupId = createdGroup?.itemGroupID;

              if (!groupId) {
                const refreshedGroups = await getGroupList(instanceConfig);
                const matchedGroup = (refreshedGroups.list || []).find(group => group.onlyName === onlyName);
                groupId = matchedGroup?.itemGroupID;
              }

              if (!groupId) {
                throw new Error('未返回 itemGroupID');
              }

              groupMap.set(onlyName, groupId);
              console.log(`[LuckyManager] ✅ [实例 ${i+1}] 创建分组: ${groupName}`);
            } catch (error) {
              if (!error.message.includes('1202')) {
                console.error(`[LuckyManager] ⚠️  [实例 ${i+1}] 创建分组失败: ${groupName} - ${error.message}`);
              }
            }
          }
        }

        for (const proxy of luckyProxies) {
          try {
            const domain = proxy.domains[0];
            if (!domain) continue;

            const matchedService = this.getServiceByDomain(services, domain);
            if (!matchedService) {
              results.details.push({ instance: i, domain, action: 'skipped', reason: 'unmanaged_proxy' });
              continue;
            }

            const configuredGroupName = matchedService?.sunpanel?.group || '其他';
            const groupOnlyName = this.buildGroupOnlyName(configuredGroupName);
            const groupId = groupMap.get(groupOnlyName);

            if (!groupId) {
              console.warn(`[LuckyManager] ⚠️  [实例 ${i+1}] 分组不存在: ${configuredGroupName}`);
              continue;
            }

            const publicUrl = this.buildSunPanelPublicUrl(proxy, domain);
            const lanUrl = matchedService?.sunpanel?.lanUrl || this.buildSunPanelLanUrl(proxy.target);
            const iconUrl = matchedService?.sunpanel?.icon || `https://${domain}/favicon.ico`;
            const onlyName = matchedService
              ? `svc-${matchedService.id}`
              : this.generateOnlyName(domain);

            const finalCardConfig = matchedService
              ? { title: matchedService.name, url: publicUrl, onlyName, iconUrl, lanUrl, description: matchedService.description, itemGroupID: groupId, itemGroupOnlyName: groupOnlyName, isSaveIcon: false }
              : { title: proxy.remark || domain, url: publicUrl, onlyName, iconUrl, lanUrl, description: proxy.remark || `反向代理: ${domain}`, itemGroupID: groupId, itemGroupOnlyName: groupOnlyName, isSaveIcon: true };

            const hash = this.calculateSunPanelHash(proxy, finalCardConfig);
            const currentState = this.stateManager.state.sunpanel.syncStatus[`${onlyName}_${i}`];

            if (currentState && currentState.hash === hash) {
              results.details.push({ instance: i, domain, action: 'skipped', reason: 'hash_unchanged' });
              continue;
            }

            let action = 'created';
            try {
              await getItemInfo(onlyName, instanceConfig);
              await syncSunPanelCard((payload) => updateItem({ onlyName, ...payload }, instanceConfig), finalCardConfig);
              action = 'updated';
            } catch (error) {
              if (error.message.includes('1203')) {
                await syncSunPanelCard((cardPayload) => createItem(cardPayload, instanceConfig), finalCardConfig);
              } else {
                throw error;
              }
            }

            if (i === 0) results.success++;
            if (i === 0 && action === 'updated') results.updated++;

            this.stateManager.state.sunpanel.syncStatus[`${onlyName}_${i}`] = {
              hash, domain, remark: proxy.remark, target: proxy.target, serviceId: matchedService?.id || null, groupId, groupOnlyName, lastSync: new Date().toISOString()
            };

            console.log(`[LuckyManager] ✅ [实例 ${i+1}] ${action === 'created' ? '创建' : '更新'}卡片: ${finalCardConfig.title}`);
          } catch (error) {
            if (i === 0) results.failed++;
            console.error(`[LuckyManager] ❌ SunPanel 实例 ${i + 1} 同步失败 (${instanceConfig.apiBase}): ${proxy.domains[0]} - ${error.message}`);
          }
        }
      }

      this.stateManager.state.sunpanel.lastSync = new Date().toISOString();
      await this.stateManager.save();

      console.log('[LuckyManager] 🎉 所有 SunPanel 实例同步完成.');
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
    const luckyInstances = this.getNormalizedLuckyInstances();
    const primaryLuckyAuth = getLuckyAuthConfig(luckyInstances[0]);
    const sunpanelInstances = this.getNormalizedSunPanelInstances();
    const primarySunPanelAuth = getSunPanelAuthConfig(sunpanelInstances[0]);

    return {
      lucky: {
        lastSync: this.stateManager.state.lucky?.lastSync || null,
        enabled: this.config.enabled,
        port: this.luckyConfig.httpsPort,
        proxyCount: Object.keys(this.stateManager.state.lucky?.syncStatus || {}).length,
        instanceCount: luckyInstances.length,
        apiBase: primaryLuckyAuth.apiBase,
        authMode: primaryLuckyAuth.authMode,
        hasOpenToken: primaryLuckyAuth.hasOpenToken,
        hasAdminToken: primaryLuckyAuth.hasAdminToken
      },
      sunpanel: {
        lastSync: this.stateManager.state.sunpanel?.lastSync || null,
        cardsCount: Object.keys(this.stateManager.state.sunpanel?.syncStatus || {}).length,
        instanceCount: sunpanelInstances.length,
        apiBase: primarySunPanelAuth.apiBase,
        hasToken: primarySunPanelAuth.hasToken
      }
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
          // 获取当前所有端口规则
          const ports = await listAllPorts(instanceConfig);

          // 只删除 HTTPS 代理端口 (默认 50000)
          const proxyPort = instanceConfig.httpsPort || 50000;
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

      // 清空本地同步状态
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

  /**
   * 清空 SunPanel 远端数据
   * 注意：SunPanel API 没有删除接口，此方法仅清空本地同步状态
   * @returns {object} 清理结果
   */
  async purgeSunPanel() {
    try {
      // 获取当前所有已同步的卡片
      const syncedCards = this.stateManager.state.sunpanel?.syncStatus || {};
      const cardList = Object.values(syncedCards);

      const result = {
        total: cardList.length,
        cleared: 0,
        message: '',
        cards: cardList.map(card => ({
          onlyName: card.onlyName || card.serviceId || 'unknown',
          title: card.remark || 'unknown',
          domain: card.domain || 'unknown',
          serviceId: card.serviceId || null
        }))
      };

      if (cardList.length === 0) {
        result.message = '没有已同步的 SunPanel 卡片需要清理';
        console.log('[LuckyManager] ℹ️  没有已同步的 SunPanel 卡片');
        return result;
      }

      // SunPanel API 没有删除接口，只能清空本地状态
      this.stateManager.state.sunpanel.syncStatus = {};
      this.stateManager.state.sunpanel.lastSync = null;
      await this.stateManager.save();

      result.cleared = cardList.length;
      result.message = `已清空本地同步状态（${cardList.length} 个卡片）。注意：SunPanel API 没有删除接口，远端卡片需要手动删除`;

      console.log(`[LuckyManager] ✅ 已清空 ${cardList.length} 个 SunPanel 卡片的本地同步状态`);
      console.log('[LuckyManager] ⚠️  SunPanel API 不支持删除，远端卡片仍需手动清理');

      return result;
    } catch (error) {
      console.error('[LuckyManager] ❌ 清空 SunPanel 数据失败:', error.message);
      throw error;
    }
  }
}

export default LuckyManager;
