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
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
    this.luckyConfig = {
      apiBase: getEnv('LUCKY_API_BASE', 'http://192.168.3.200:16601'),
      openToken: getEnv('LUCKY_OPEN_TOKEN', ''),
      httpsPort: parseInt(getEnv('LUCKY_HTTPS_PORT', '50000'))
    };
    this.sunpanelConfig = {
      apiBase: getEnv('SUNPANEL_API_BASE', 'http://192.168.3.200:20001/openapi/v1'),
      apiToken: getEnv('SUNPANEL_API_TOKEN', '')
    };
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

  /**
   * 获取所有Lucky代理
   */
  async getLuckyProxies() {
    try {
      const proxies = await getAllProxies();
      return proxies.map(p => ({
        port: p.port,
        remark: p.remark,
        domains: p.domains,
        target: p.target,
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
          }
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
  async syncToSunPanel() {
    console.log('[LuckyManager] 🔄 开始同步Lucky到SunPanel...');

    try {
      // 获取Lucky代理
      const luckyProxies = await this.getLuckyProxies();

      // 获取SunPanel分组
      const groupsData = await getGroupList();
      const groups = groupsData.list || [];

      // 构建分组映射
      const groupMap = new Map();
      groups.forEach(g => groupMap.set(g.onlyName, g.itemGroupID));

      // 创建默认分组（如果不存在）
      const defaultGroups = ['NAS', '服务器', '其他'];
      for (const groupName of defaultGroups) {
        const onlyName = groupName.toLowerCase().replace(/\s+/g, '-');
        if (!groupMap.has(onlyName)) {
          try {
            const result = await createGroup({
              title: groupName,
              onlyName
            });
            groupMap.set(onlyName, result.itemGroupID);
            console.log(`[LuckyManager] ✅ 创建分组: ${groupName}`);
          } catch (error) {
            if (!error.message.includes('1202')) { // 忽略已存在的错误
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

      // 同步每个代理到SunPanel
      for (const proxy of luckyProxies) {
        try {
          const domain = proxy.domains[0];
          if (!domain) continue;

          const onlyName = this.generateOnlyName(domain);

          // 确定分组
          let groupName = '其他';
          if (domain.includes('nas')) {
            groupName = 'NAS';
          } else if (domain.includes('web') || domain.includes('server')) {
            groupName = '服务器';
          }

          const groupOnlyName = groupName.toLowerCase().replace(/\s+/g, '-');
          const groupId = groupMap.get(groupOnlyName);

          if (!groupId) {
            console.warn(`[LuckyManager] ⚠️  分组不存在: ${groupName}`);
            continue;
          }

          // 构建卡片配置
          const cardConfig = {
            title: proxy.remark || domain,
            url: `https://${domain}`,
            onlyName,
            iconUrl: `https://${domain}/favicon.ico`,
            lanUrl: proxy.target,
            description: proxy.remark || `反向代理: ${domain}`,
            itemGroupID: groupId,
            itemGroupOnlyName: groupOnlyName,
            isSaveIcon: true
          };

          // 计算hash
          const hash = this.calculateHash(proxy);

          // 检查是否已存在
          const currentState = this.stateManager.state.sunpanel.syncStatus[onlyName];

          if (currentState && currentState.hash === hash) {
            // Hash未变化，跳过
            results.details.push({
              domain,
              action: 'skipped',
              reason: 'hash_unchanged'
            });
            continue;
          }

          // 尝试获取现有卡片
          let action = 'created';
          try {
            const existing = await getItemInfo(onlyName);
            // 更新卡片
            await syncSunPanelCard(
              (payload) => updateItem({
                onlyName,
                ...payload
              }),
              cardConfig
            );
            action = 'updated';
          } catch (error) {
            // 卡片不存在，创建新卡片
            if (error.message.includes('1203')) {
              await syncSunPanelCard(createItem, cardConfig);
            } else {
              throw error;
            }
          }

          results.success++;
          if (action === 'updated') results.updated++;

          // 更新同步状态
          this.stateManager.state.sunpanel.syncStatus[onlyName] = {
            hash,
            domain,
            remark: proxy.remark,
            target: proxy.target,
            groupId,
            lastSync: new Date().toISOString()
          };

          console.log(`[LuckyManager] ✅ ${action === 'created' ? '创建' : '更新'}卡片: ${cardConfig.title}`);
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

      // 更新状态
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
        port: this.luckyConfig.httpsPort
      },
      sunpanel: {
        lastSync: this.stateManager.state.sunpanel?.lastSync || null,
        cardsCount: Object.keys(this.stateManager.state.sunpanel?.syncStatus || {}).length
      }
    };
  }
}

export default LuckyManager;
