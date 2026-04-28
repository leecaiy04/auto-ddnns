#!/usr/bin/env node
/**
 * Lucky DDNS 任务管理 API
 * 用于管理 Lucky 内置的 DDNS 任务（支持阿里云 DNS 等多个提供商）
 */

import { openTokenFetch } from './lucky-api.mjs';
import { getEnv } from '../../shared/env-loader.mjs';

// ==================== DDNS API ====================

/**
 * 获取所有 DDNS 任务列表
 * @param {Object} config - 配置对象 (apiBase, openToken 等)
 * @returns {Promise<Object>} 任务列表，包含 ret, data, total 等字段
 */
export async function getDDNSTaskList(config = null) {
  return await openTokenFetch('/api/ddnstasklist', {}, config);
}

/**
 * 从 DDNS 任务列表响应中提取任务数组
 * Lucky 返回 { ret, data: [...] }，兼容 { ret, list: [...] }
 */
function extractTaskList(result) {
  if (!result || result.ret !== 0) return [];
  return result.data || result.list || [];
}

/**
 * 获取全局 DDNS 配置
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 全局配置
 */
export async function getDDNSConfigure(config = null) {
  return await openTokenFetch('/api/ddns/configure', {}, config);
}

/**
 * 更新全局 DDNS 配置
 * @param {Object} configure - 配置数据
 * @param {Object} config - Lucky API 配置对象
 * @returns {Promise<Object>} 更新结果
 */
export async function updateDDNSConfigure(configure, config = null) {
  return await openTokenFetch('/api/ddns/configure', {
    method: 'PUT',
    body: configure
  }, config);
}

/**
 * 创建 DDNS 任务
 * @param {Object} options - 任务选项
 * @param {string} options.taskName - 任务名称
 * @param {string} [options.taskType='IPv6'] - 任务类型: "IPv4" 或 "IPv6"
 * @param {boolean} [options.enable=true] - 是否启用
 * @param {Object} options.dns - DNS 配置
 * @param {string} options.dns.name - DNS 提供商名称 (如 "alidns")
 * @param {string} options.dns.id - DNS API ID / AccessKeyId
 * @param {string} options.dns.secret - DNS API Secret / AccessKeySecret
 * @param {number} [options.dns.forceInterval=3600] - 强制同步间隔（秒）
 * @param {Array} options.records - DNS 记录列表
 * @param {number} [options.intervals=36] - 检查间隔（分钟）
 * @param {Object} config - Lucky API 配置对象
 * @returns {Promise<Object>} 创建结果
 */
export async function createDDNSTask({
  taskName,
  taskType = 'IPv6',
  enable = true,
  dns,
  records,
  intervals = 36
}, config = null) {
  const requestBody = {
    TaskName: taskName,
    TaskKey: '',
    TaskType: taskType,
    Enable: enable,
    DiaglogShowMode: 'simple',
    HttpClientTimeout: 15,
    InsecureSkipVerify: false,
    FirstCheckDelay: 16,
    Intervals: intervals,
    DebugMode: false,
    DNS: {
      Name: dns.name || 'alidns',
      ID: dns.id,
      Secret: dns.secret,
      ForceInterval: dns.forceInterval || 3600,
      ResolverDoaminCheck: true,
      HttpClientProxyType: '',
      CallAPINetwork: '',
      HttpClientProxyAddr: '',
      HttpClientProxyUser: '',
      HttpClientProxyPassword: '',
      Callback: {
        URL: '',
        Method: '',
        Headers: [],
        RequestBody: '',
        Server: '',
        CallbackSuccessContent: [],
        DisableCallbackSuccessContentCheck: false
      }
    },
    GlobalWebhook: false,
    WebhookEnable: false,
    IngoreWebhookVariablesNotFound: false,
    IngoreWebhookVariablesNotFoundList: '',
    WebhookURL: '',
    WebhookMethod: 'get',
    WebhookHeaders: [],
    WebhookRequestBody: '',
    WebhookDisableCallbackSuccessContentCheck: false,
    WebhookSuccessContent: [],
    WebhookProxy: '',
    WebhookProxyAddr: '',
    WebhookProxyUser: '',
    WebhookProxyPassword: '',
    RetryCount: 0,
    RetryInterval: 500,
    TTL: '',
    V6QueryIPEnable: false,
    V6QueryIPType: 'url',
    V6QueryUrl: 'http://v6.66666.host:66/ip\nhttp://myip6.ipip.net\nhttps://6.ipw.cn\nhttp://v4.666666.host:66/ip',
    V6NetInterface: 'eth0',
    V6NetInterfaceIPReg: '',
    V6GetIPScript: '',
    V6DUID: '',
    V4QueryIPEnable: false,
    V4QueryIPType: 'url',
    V4QueryUrl: 'https://ddns.oray.com/checkip\nhttp://v4.66666.host:66/ip\nhttps://myip.ipip.net\nhttp://v4.666666.host:66/ip\nhttps://4.ipw.cn\nhttps://ip.3322.net',
    V4NetInterface: 'eth0',
    V4NetInterfaceIPReg: '',
    V4GetIPScript: '',
    Records: (records || []).map(record => ({
      SyncRecordData: {
        type: record.type || 'AAAA',
        remark: record.remark || '',
        fullDomainName: record.fullDomainName || record.subDomain || '',
        ttl: record.ttl || 0,
        BizName: record.bizName || 'web',
        AliESASourceType: 'Domain',
        AliESAHostPolicy: 'follow_hostname',
        ipv6Address: record.ipv6Address || '{ipv6Addr}'
      },
      Disable: record.disable || false
    }))
  };

  return await openTokenFetch('/api/ddns', {
    method: 'POST',
    body: requestBody
  }, config);
}

/**
 * 更新 DDNS 任务
 * @param {string} taskKey - 任务 Key
 * @param {Object} taskData - 完整的任务数据（通常从 getDDNSTaskList 获取后修改）
 * @param {Object} config - Lucky API 配置对象
 * @returns {Promise<Object>} 更新结果
 */
export async function updateDDNSTask(taskKey, taskData, config = null) {
  return await openTokenFetch(`/api/ddns?key=${encodeURIComponent(taskKey)}`, {
    method: 'PUT',
    body: taskData
  }, config);
}

/**
 * 删除 DDNS 任务
 * @param {string} taskKey - 任务 Key
 * @param {Object} config - Lucky API 配置对象
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteDDNSTask(taskKey, config = null) {
  return await openTokenFetch(`/api/ddns?key=${encodeURIComponent(taskKey)}`, {
    method: 'DELETE'
  }, config);
}

/**
 * 启用/禁用 DDNS 任务
 * @param {string} taskKey - 任务 Key
 * @param {boolean} enable - true 启用, false 禁用
 * @param {Object} config - Lucky API 配置对象
 * @returns {Promise<Object>} 操作结果
 */
export async function toggleDDNSTask(taskKey, enable, config = null) {
  return await openTokenFetch(`/api/ddns/enable?enable=${enable}&key=${encodeURIComponent(taskKey)}`, {}, config);
}

/**
 * 手动触发 DDNS 同步
 * @param {string} taskKey - 任务 Key
 * @param {Object} config - Lucky API 配置对象
 * @returns {Promise<Object>} 同步结果
 */
export async function manualSyncDDNS(taskKey, config = null) {
  return await openTokenFetch(`/api/ddns/manualSync/${encodeURIComponent(taskKey)}`, {}, config);
}

/**
 * 获取 DDNS 日志
 * @param {number} [page=1] - 页码
 * @param {number} [pageSize=20] - 每页数量
 * @param {Object} config - Lucky API 配置对象
 * @returns {Promise<Object>} 日志列表
 */
export async function getDDNSLogs(page = 1, pageSize = 20, config = null) {
  return await openTokenFetch(`/api/ddns/logs?pageSize=${pageSize}&page=${page}`, {}, config);
}

/**
 * 获取最近 DDNS 日志
 * @param {Object} config - Lucky API 配置对象
 * @returns {Promise<Object>} 最近日志
 */
export async function getDDNSLastLogs(config = null) {
  return await openTokenFetch('/api/ddns/lastlogs', {}, config);
}

// ==================== 便捷函数 ====================

/**
 * 构建阿里云 DNS 凭据
 * @param {Object} [overrides] - 可选覆盖值
 * @returns {{ name: string, id: string, secret: string, forceInterval: number }}
 */
export function buildAliyunDNSCredentials(overrides = {}) {
  return {
    name: overrides.name || 'alidns',
    id: overrides.id || getEnv('ALIYUN_AK', '').trim(),
    secret: overrides.secret || getEnv('ALIYUN_SK', '').trim(),
    forceInterval: overrides.forceInterval || 3600
  };
}

/**
 * 创建简单的 DDNS 记录配置
 * @param {string} subDomain - 子域名（如 "v6"、"*"、"" 代表根域名）
 * @param {string} [type='AAAA'] - 记录类型: "A" 或 "AAAA"
 * @param {Object} [options] - 可选参数
 * @returns {Object} 记录配置
 */
export function buildRecord(subDomain, type = 'AAAA', options = {}) {
  return {
    type,
    fullDomainName: subDomain,
    remark: options.remark || '',
    ttl: options.ttl || 0,
    bizName: options.bizName || 'web',
    ipv6Address: options.ipv6Address || (type === 'AAAA' ? '{ipv6Addr}' : '{ipv4Addr}'),
    disable: options.disable || false
  };
}

/**
 * 按任务名称查找 DDNS 任务
 * @param {string} taskName - 任务名称
 * @param {Object} config - Lucky API 配置对象
 * @returns {Promise<Object|null>} 找到的任务或 null
 */
export async function findDDNSTaskByName(taskName, config = null) {
  const result = await getDDNSTaskList(config);
  return extractTaskList(result).find(t => t.TaskName === taskName) || null;
}

/**
 * 获取指定域名对应的 DDNS 任务
 * @param {string} domain - 域名（如 "sub.example.com"）
 * @param {Object} config - Lucky API 配置对象
 * @returns {Promise<Array>} 匹配的任务列表
 */
export async function findDDNSTasksByDomain(domain, config = null) {
  const result = await getDDNSTaskList(config);
  const normalizedDomain = domain.toLowerCase();
  return extractTaskList(result).filter(task => {
    return (task.Records || []).some(record => {
      const fullDomain = record.SyncRecordData?.fullDomainName || '';
      return fullDomain.toLowerCase() === normalizedDomain;
    });
  });
}

// ==================== CLI 接口 ====================

async function printDDNSTaskList(config = null) {
  const result = await getDDNSTaskList(config);

  if (result.ret !== 0) {
    console.error(`获取 DDNS 任务列表失败: ${result.msg || '未知错误'}`);
    return;
  }

  console.log('\n=== Lucky DDNS 任务列表 ===\n');

  const tasks = extractTaskList(result);
  if (tasks.length === 0) {
    console.log('暂无 DDNS 任务');
    return;
  }

  for (const task of tasks) {
    const status = task.Enable ? '✅' : '❌';
    const taskType = task.TaskType || 'IPv6';
    const dnsName = task.DNS?.Name || '未知';
    const recordCount = (task.Records || []).length;
    const records = (task.Records || [])
      .map(r => `${r.SyncRecordData?.type || '?'}:${r.SyncRecordData?.fullDomainName || '?'}`)
      .join(', ');

    console.log(`${status} ${task.TaskName} (${taskType})`);
    console.log(`   Key: ${task.TaskKey}`);
    console.log(`   DNS: ${dnsName}`);
    console.log(`   记录: ${records}`);
    console.log(`   间隔: ${task.Intervals || 0} 分钟`);
    console.log('');
  }

  console.log(`共 ${tasks.length} 个任务`);
}

async function printDDNSLogs(config = null) {
  let result;
  try {
    result = await Promise.race([
      getDDNSLastLogs(config),
      new Promise((_, reject) => setTimeout(() => reject(new Error('获取超时')), 10000))
    ]);
  } catch (err) {
    console.error(`获取 DDNS 日志失败: ${err.message}`);
    return;
  }

  if (result.ret !== 0) {
    console.error(`获取 DDNS 日志失败: ${result.msg || '未知错误'}`);
    return;
  }

  console.log('\n=== 最近 DDNS 日志 ===\n');

  const logs = result.lastLogs || [];
  if (logs.length === 0) {
    console.log('暂无日志');
    return;
  }

  for (const log of logs) {
    const time = log.LogTime || '未知时间';
    console.log(`[${time}] ${log.LogContent || ''}`);
  }
}

async function printDDNSStatus(config = null) {
  const [taskResult, configResult] = await Promise.all([
    getDDNSTaskList(config),
    getDDNSConfigure(config)
  ]);

  if (taskResult.ret !== 0) {
    console.error(`获取 DDNS 状态失败: ${taskResult.msg || '未知错误'}`);
    return;
  }

  const tasks = taskResult.list || [];
  const enabled = tasks.filter(t => t.Enable).length;
  const disabled = tasks.length - enabled;
  const globalEnabled = configResult?.ddnsconfigure?.Enable ?? true;

  console.log('\n=== DDNS 状态概览 ===\n');
  console.log(`全局状态: ${globalEnabled ? '✅ 已启用' : '❌ 已禁用'}`);
  console.log(`任务总数: ${tasks.length} (启用: ${enabled}, 禁用: ${disabled})`);

  if (configResult?.ddnsconfigure) {
    const c = configResult.ddnsconfigure;
    console.log(`检查间隔: ${c.Intervals || 0} 分钟`);
    console.log(`首次延迟: ${c.FirstCheckDelay || 0} 秒`);
  }

  console.log('');
}

// CLI 入口
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  switch (command) {
    case 'list':
      await printDDNSTaskList();
      break;

    case 'logs':
      await printDDNSLogs();
      break;

    case 'status':
      await printDDNSStatus();
      break;

    case 'create': {
      const name = process.argv[3];
      const subDomain = process.argv[4];
      const domainType = process.argv[5] || 'AAAA';

      if (!name || !subDomain) {
        console.error('用法: node lucky-ddns.mjs create <任务名> <子域名> [AAAA|A]');
        process.exit(1);
      }

      const dns = buildAliyunDNSCredentials();
      if (!dns.id || !dns.secret) {
        console.error('❌ 未配置阿里云凭据 (ALIYUN_AK / ALIYUN_SK)');
        process.exit(1);
      }

      const taskType = domainType === 'A' ? 'IPv4' : 'IPv6';
      const result = await createDDNSTask({
        taskName: name,
        taskType,
        dns,
        records: [buildRecord(subDomain, domainType)]
      });

      if (result.ret === 0) {
        console.log(`✅ DDNS 任务 "${name}" 创建成功`);
      } else {
        console.error(`❌ 创建失败: ${result.msg}`);
      }
      break;
    }

    case 'delete': {
      const taskKey = process.argv[3];
      if (!taskKey) {
        console.error('用法: node lucky-ddns.mjs delete <TaskKey>');
        process.exit(1);
      }

      const result = await deleteDDNSTask(taskKey);
      if (result.ret === 0) {
        console.log(`✅ DDNS 任务 ${taskKey} 已删除`);
      } else {
        console.error(`❌ 删除失败: ${result.msg}`);
      }
      break;
    }

    case 'enable': {
      const taskKey = process.argv[3];
      if (!taskKey) {
        console.error('用法: node lucky-ddns.mjs enable <TaskKey>');
        process.exit(1);
      }

      const result = await toggleDDNSTask(taskKey, true);
      if (result.ret === 0) {
        console.log(`✅ DDNS 任务 ${taskKey} 已启用`);
      } else {
        console.error(`❌ 操作失败: ${result.msg}`);
      }
      break;
    }

    case 'disable': {
      const taskKey = process.argv[3];
      if (!taskKey) {
        console.error('用法: node lucky-ddns.mjs disable <TaskKey>');
        process.exit(1);
      }

      const result = await toggleDDNSTask(taskKey, false);
      if (result.ret === 0) {
        console.log(`✅ DDNS 任务 ${taskKey} 已禁用`);
      } else {
        console.error(`❌ 操作失败: ${result.msg}`);
      }
      break;
    }

    default:
      console.log(`
Lucky DDNS 管理工具

用法:
  node lucky-ddns.mjs list                  # 列出所有 DDNS 任务
  node lucky-ddns.mjs logs                  # 查看最近日志
  node lucky-ddns.mjs status                # 查看状态概览
  node lucky-ddns.mjs create <名称> <子域名> [AAAA|A]  # 创建任务
  node lucky-ddns.mjs delete <TaskKey>      # 删除任务
  node lucky-ddns.mjs enable <TaskKey>      # 启用任务
  node lucky-ddns.mjs disable <TaskKey>     # 禁用任务

示例:
  node lucky-ddns.mjs list
  node lucky-ddns.mjs create "我的DDNS" v6 AAAA
  node lucky-ddns.mjs enable <TaskKey>
      `);
  }
}
