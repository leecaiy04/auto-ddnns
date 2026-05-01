/**
 * SunPanel Sync Skill
 * SunPanel 导航面板同步功能
 */

import { listAllPorts } from '../../modules/lucky-manager/lucky-port-manager.mjs';
import { getEnv } from '../../shared/env-loader.mjs';

const luckyConfig = {
  apiBase: getEnv('LUCKY_API_BASE'),
  openToken: getEnv('LUCKY_OPEN_TOKEN')
};

/**
 * 同步 Lucky 反向代理规则到 SunPanel
 */
export async function syncFromLucky(params = {}) {
  const { port } = params;

  // 获取所有端口的反向代理规则
  const ports = await listAllPorts(luckyConfig);

  // 过滤指定端口
  const targetPorts = port ? ports.filter(p => p.port === port) : ports;

  // 提取所有反向代理规则
  const proxyRules = [];
  for (const portInfo of targetPorts) {
    if (portInfo.proxyRules && portInfo.proxyRules.length > 0) {
      proxyRules.push(...portInfo.proxyRules.map(rule => ({
        ...rule,
        port: portInfo.port
      })));
    }
  }

  // 注意：实际的 SunPanel 同步功能需要通过 SunPanelManager 模块实现
  // 这里只返回需要同步的规则列表
  console.warn('[SunPanelSync] 注意：实际同步功能需要通过 Central Hub 的 SunPanelManager 模块实现');

  return {
    totalRules: proxyRules.length,
    rules: proxyRules,
    message: '已获取反向代理规则列表，实际同步需要通过 Central Hub 执行'
  };
}

/**
 * 手动添加服务到 SunPanel
 */
export async function addService(params) {
  const { name, url, icon, description, category } = params;

  // 这里需要实现直接调用 SunPanel API 添加服务的逻辑
  // 目前 sunpanel-sync 模块主要用于同步 Lucky 规则
  // 可以扩展该模块支持手动添加

  throw new Error('手动添加服务功能待实现');
}

/**
 * 批量同步服务
 */
export async function batchSync(services) {
  const results = [];

  for (const service of services) {
    try {
      const result = await syncFromLucky({ port: service.port });
      results.push({
        service: service.name || `port-${service.port}`,
        status: 'success',
        result
      });
    } catch (error) {
      results.push({
        service: service.name || `port-${service.port}`,
        status: 'error',
        error: error.message
      });
    }
  }

  return results;
}

export default {
  syncFromLucky,
  addService,
  batchSync
};
