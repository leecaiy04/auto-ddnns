/**
 * SunPanel 管理模块
 * 负责将 Lucky 反向代理规则同步为 SunPanel 仪表盘卡片
 */

import crypto from 'crypto';
import {
  getGroupList,
  createGroup,
  createItem,
  updateItem,
  getItemInfo,
  deleteItem
} from './sunpanel-api.mjs';
import { getEnv } from '../../shared/env-loader.mjs';

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

function formatTargetHost(targetHost) {
  return targetHost?.includes(':') ? `[${targetHost}]` : targetHost;
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

export class SunPanelManager {
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
    this.sunpanelConfig = {
      apiBase: config.apiBase || getEnv('SUNPANEL_API_BASE', 'http://192.168.9.2:20001/openapi/v1'),
      apiToken: config.apiToken || getEnv('SUNPANEL_API_TOKEN', ''),
      instances: Array.isArray(config.instances) ? config.instances : undefined
    };
    console.log('[SunPanelManager] config initialized:', {
      apiBase: this.sunpanelConfig.apiBase,
      apiToken: this.sunpanelConfig.apiToken ? `${this.sunpanelConfig.apiToken.substring(0, 10)}...` : 'EMPTY'
    });
  }

  /**
   * 初始化模块
   */
  async init() {
    console.log('[SunPanelManager] 初始化SunPanel管理模块...');

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

    console.log('[SunPanelManager] ✅ SunPanel管理模块初始化完成');
  }

  /**
   * 计算卡片配置的 Hash 值
   */
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

  buildGroupOnlyName(groupName) {
    return String(groupName || '其他').trim().toLowerCase().replace(/\s+/g, '-');
  }

  buildPublicUrl(proxy, domain) {
    const scheme = proxy.enableTLS === false ? 'http' : 'https';
    const defaultPort = scheme === 'https' ? 443 : 80;
    const port = proxy.port && proxy.port !== defaultPort ? proxy.port : '';
    return buildUrlString(`${scheme}:`, domain, port);
  }

  buildLanUrl(target, luckyLanHost) {
    if (!target) return '';

    try {
      const parsed = new URL(target);
      const hasExplicitPort = hasExplicitPortInUrl(target);
      const host = stripIPv6Brackets(parsed.hostname);
      const resolvedHost = isLoopbackHost(host) && luckyLanHost
        ? luckyLanHost
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

  /**
   * 智能推断服务分组
   * @param {object} service - 服务对象
   * @param {string} domain - 域名
   * @returns {string} 分组名称
   */
  inferServiceGroup(service, domain) {
    // 如果服务配置中明确指定了分组，使用配置的分组
    if (service?.sunpanel?.group) {
      return service.sunpanel.group;
    }

    // 根据设备 ID 推断分组
    const deviceId = service?.device || '';
    if (deviceId === '200' || deviceId === '201') {
      return 'NAS';
    }

    // 根据域名或服务名称推断
    const name = (service?.name || domain || '').toLowerCase();
    if (name.includes('nas') || name.includes('nextcloud') || name.includes('fnos')) {
      return 'NAS';
    }
    if (name.includes('server') || name.includes('服务器')) {
      return '服务器';
    }

    // 默认分组
    return '其他';
  }

  /**
   * 同步 Lucky 代理到 SunPanel 卡片
   * @param {Array} services - 服务列表
   * @param {Array} luckyProxies - Lucky 代理列表（由 coordinator 从 LuckyManager 获取）
   * @param {string|null} luckyLanHost - Lucky 的局域网 IP（由 coordinator 从 LuckyManager 获取）
   */
  async syncToSunPanel(services = [], luckyProxies = [], luckyLanHost = null) {
    console.log('[SunPanelManager] 🔄 开始同步Lucky到SunPanel实例...');

    try {
      const instances = this.sunpanelConfig.instances || [this.sunpanelConfig];
      const results = { success: 0, failed: 0, updated: 0, details: [] };

      for (let i = 0; i < instances.length; i++) {
        const instanceConfig = { ...this.sunpanelConfig, ...instances[i] };
        console.log(`[SunPanelManager] ➡️ 正在同步到 SunPanel 实例 ${i + 1} (${instanceConfig.apiBase})`);

        const groupsData = await getGroupList(instanceConfig);
        const groups = groupsData.list || [];
        const groupMap = new Map();
        groups.forEach(group => groupMap.set(group.onlyName, group.itemGroupID));

        const defaultGroups = ['NAS', '服务器', '其他'];
        for (const groupName of defaultGroups) {
          const onlyName = this.buildGroupOnlyName(groupName);
          if (!groupMap.has(onlyName)) {
            try {
              const result = await createGroup({ title: groupName, onlyName }, instanceConfig);
              groupMap.set(onlyName, result.itemGroupID);
              console.log(`[SunPanelManager] ✅ [实例 ${i+1}] 创建分组: ${groupName}`);
            } catch (error) {
              if (!error.message.includes('1202')) {
                console.error(`[SunPanelManager] ⚠️  [实例 ${i+1}] 创建分组失败: ${groupName} - ${error.message}`);
              }
            }
          }
        }

        for (const proxy of luckyProxies) {
          try {
            const domain = proxy.domains[0];
            if (!domain) continue;

            const matchedService = this.getServiceByDomain(services, domain);
            const configuredGroupName = this.inferServiceGroup(matchedService, domain);
            const groupOnlyName = this.buildGroupOnlyName(configuredGroupName);
            const groupId = groupMap.get(groupOnlyName);

            if (!groupId) {
              console.warn(`[SunPanelManager] ⚠️  [实例 ${i+1}] 分组不存在: ${configuredGroupName}`);
              continue;
            }

            const publicUrl = this.buildPublicUrl(proxy, domain);
            const lanUrl = matchedService?.sunpanel?.lanUrl || this.buildLanUrl(proxy.target, luckyLanHost);
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

            console.log(`[SunPanelManager] ✅ [实例 ${i+1}] ${action === 'created' ? '创建' : '更新'}卡片: ${finalCardConfig.title}`);
          } catch (error) {
            if (i === 0) results.failed++;
            console.error(`[SunPanelManager] ❌ [实例 ${i+1}] 同步失败: ${proxy.domains[0]} - ${error.message}`);
          }
        }

        // 清理不在 Lucky 代理列表中的 SunPanel 卡片
        const luckyDomains = new Set(luckyProxies.flatMap(p => p.domains));
        const syncStatusKeys = Object.keys(this.stateManager.state.sunpanel.syncStatus || {});

        for (const key of syncStatusKeys) {
          if (!key.endsWith(`_${i}`)) continue;

          const status = this.stateManager.state.sunpanel.syncStatus[key];
          if (!status || !status.domain) continue;

          if (!luckyDomains.has(status.domain)) {
            try {
              const onlyName = key.replace(`_${i}`, '');
              await deleteItem(onlyName, instanceConfig);
              delete this.stateManager.state.sunpanel.syncStatus[key];
              if (i === 0) results.success++;
              console.log(`[SunPanelManager] 🗑️ [实例 ${i+1}] 已删除不存在的卡片: ${status.domain}`);
            } catch (error) {
              if (error.message.includes('1203')) {
                delete this.stateManager.state.sunpanel.syncStatus[key];
                console.log(`[SunPanelManager] 🗑️ [实例 ${i+1}] 清理状态: ${status.domain} (卡片已不存在)`);
              } else {
                console.error(`[SunPanelManager] ❌ [实例 ${i+1}] 删除卡片失败: ${status.domain} - ${error.message}`);
              }
            }
          }
        }
      }

      this.stateManager.state.sunpanel.lastSync = new Date().toISOString();
      await this.stateManager.save();

      console.log(`[SunPanelManager] 🎉 所有 SunPanel 实例同步完成.`);
      return results;
    } catch (error) {
      console.error('[SunPanelManager] ❌ 同步到SunPanel失败:', error.message);
      throw error;
    }
  }

  /**
   * 获取状态摘要
   */
  getStatus() {
    return {
      lastSync: this.stateManager.state.sunpanel?.lastSync || null,
      cardsCount: Object.keys(this.stateManager.state.sunpanel?.syncStatus || {}).length
    };
  }

  /**
   * 清空 SunPanel 远端数据
   * @param {string[]} manualOnlyNames - 可选：手动指定要删除的卡片 onlyName 列表（当本地状态丢失时使用）
   * @returns {object} 清理结果
   */
  async purgeSunPanel(manualOnlyNames = null) {
    try {
      console.log('[SunPanelManager] purgeSunPanel 调用参数:', { manualOnlyNames, type: typeof manualOnlyNames, isArray: Array.isArray(manualOnlyNames) });

      const syncedCards = this.stateManager.state.sunpanel?.syncStatus || {};
      let cardList = Object.entries(syncedCards).map(([key, value]) => ({
        ...value,
        onlyName: key.replace(/_\d+$/, '') // 移除实例后缀
      }));

      // 如果提供了手动列表，使用手动列表
      if (manualOnlyNames && Array.isArray(manualOnlyNames) && manualOnlyNames.length > 0) {
        cardList = manualOnlyNames.map(onlyName => ({ onlyName, remark: onlyName }));
        console.log(`[SunPanelManager] 使用手动指定的 ${cardList.length} 个卡片进行删除`);
      } else {
        console.log('[SunPanelManager] 使用本地同步状态，共', cardList.length, '个卡片');
      }

      const result = {
        total: cardList.length,
        deleted: 0,
        failed: 0,
        errors: [],
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
        console.log('[SunPanelManager] ℹ️  没有已同步的 SunPanel 卡片');
        return result;
      }

      // 删除所有实例上的卡片
      const instances = this.sunpanelConfig.instances || [this.sunpanelConfig];

      for (let i = 0; i < instances.length; i++) {
        const instanceConfig = { ...this.sunpanelConfig, ...instances[i] };
        console.log(`[SunPanelManager] ➡️ 正在清理 SunPanel 实例 ${i + 1} (${instanceConfig.apiBase})`);

        for (const card of cardList) {
          try {
            await deleteItem(card.onlyName, instanceConfig);
            if (i === 0) result.deleted++;
            console.log(`[SunPanelManager] 🗑️ [实例 ${i+1}] 已删除卡片: ${card.onlyName} (${card.remark || 'unknown'})`);
          } catch (error) {
            if (error.message.includes('1203')) {
              // 卡片不存在，跳过
              console.log(`[SunPanelManager] ℹ️  [实例 ${i+1}] 卡片不存在: ${card.onlyName}`);
            } else {
              if (i === 0) {
                result.failed++;
                result.errors.push({ onlyName: card.onlyName, error: error.message });
              }
              console.error(`[SunPanelManager] ❌ [实例 ${i+1}] 删除卡片失败: ${card.onlyName} - ${error.message}`);
            }
          }
        }
      }

      // 清空本地同步状态
      this.stateManager.state.sunpanel.syncStatus = {};
      this.stateManager.state.sunpanel.lastSync = null;
      await this.stateManager.save();

      result.message = `成功删除 ${result.deleted} 个卡片，失败 ${result.failed} 个`;
      console.log(`[SunPanelManager] ✅ 清理完成: 删除 ${result.deleted} 个，失败 ${result.failed} 个`);

      return result;
    } catch (error) {
      console.error('[SunPanelManager] ❌ 清空 SunPanel 数据失败:', error.message);
      throw error;
    }
  }
}

export default SunPanelManager;
