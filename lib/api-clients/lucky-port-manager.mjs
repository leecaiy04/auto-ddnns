// Lucky Web服务端口管理
import {
  // 获取规则
  getReverseProxyRules,

  // 创建端口
  createPort,
  createListenRule,

  // 更新规则
  updateRule,

  // 添加子规则
  addSubRule,
  addReverseProxy,
  addRedirect,
  addFileServer,

  // 删除规则
  deleteRule,
  deletePort,
  deleteRuleByName
} from './lucky-reverseproxy.mjs';

import { PORT_WHITELIST, PORT_WHITELIST_ENABLED } from './lucky-api.mjs';

// ==================== 安全检查函数 ====================

/**
 * 检查端口是否在白名单中
 * @param {number} port - 端口号
 * @returns {boolean} 是否允许操作
 */
export function isPortAllowed(port) {
  // 如果未启用白名单，允许所有端口
  if (!PORT_WHITELIST_ENABLED) {
    return true;
  }

  // 检查端口是否在白名单中
  return PORT_WHITELIST.includes(port);
}

/**
 * 检查端口是否在白名单中，不在则抛出错误
 * @param {number} port - 端口号
 * @throws {Error} 端口不在白名单中
 */
export function checkPortWhitelist(port) {
  if (!isPortAllowed(port)) {
    throw new Error(
      `端口 ${port} 不在白名单中。` +
      `当前白名单: [${PORT_WHITELIST.join(', ') || '空'}]\n` +
      `如需操作此端口，请将 ${port} 添加到 src/lucky-api.mjs 的 PORT_WHITELIST 中，` +
      `或设置 PORT_WHITELIST_ENABLED = false 禁用白名单检查。`
    );
  }
  return true;
}

/**
 * 获取白名单状态信息
 * @returns {Object} 白名单状态
 */
export function getWhitelistStatus() {
  return {
    enabled: PORT_WHITELIST_ENABLED,
    ports: PORT_WHITELIST,
    count: PORT_WHITELIST.length,
    message: PORT_WHITELIST_ENABLED
      ? `白名单已启用，仅允许操作 ${PORT_WHITELIST.length} 个端口`
      : '白名单未启用，允许操作所有端口'
  };
}

/**
 * 获取所有端口规则列表
 * @returns {Promise<Array>} 端口规则列表
 */
export async function listAllPorts(config = null) {
  const data = await getReverseProxyRules(config);
  if (data.ret !== 0) {
    throw new Error(`Lucky API 错误 ${data.ret}: ${data.msg || '未知错误'}`);
  }

  if (!Array.isArray(data.ruleList)) {
    throw new Error('Lucky API 响应缺少 ruleList');
  }

  return data.ruleList.map(r => ({
    key: r.RuleKey,
    name: r.RuleName,
    port: r.ListenPort,
    network: r.Network,
    ip: r.ListenIP || '所有地址',
    tls: r.EnableTLS,
    enabled: r.Enable,
    subRuleCount: r.ProxyList?.length || 0,
    subRules: r.ProxyList?.map(p => ({
      key: p.Key,
      name: p.Remark,
      type: p.WebServiceType,
      domains: p.Domains,
      targets: p.Locations,
      enabled: p.Enable,
      rawAdvanced: {
        LocationInsecureSkipVerify: p.LocationInsecureSkipVerify,
        EnableAccessLog: p.EnableAccessLog,
        CorazaWAFInstance: p.CorazaWAFInstance,
        EasyLucky: p.EasyLucky,
        OtherParams: p.OtherParams
      }
    })) || []
  }));
}

/**
 * 获取端口详情（包含所有子规则）
 * @param {number} port - 端口号
 * @returns {Promise<Object|null>} 端口详情
 */
export async function getPortDetail(port, config = null) {
  const ports = await listAllPorts(config);
  return ports.find(p => p.port === port) || null;
}

function ensureRuleListResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Lucky API 返回了无效响应');
  }

  if (data.ret !== 0) {
    throw new Error(`Lucky API 错误 ${data.ret}: ${data.msg || '未知错误'}`);
  }

  if (!Array.isArray(data.ruleList)) {
    throw new Error('Lucky API 响应缺少 ruleList');
  }

  return data.ruleList;
}

async function getRawRuleByPort(port, config = null) {
  const data = await getReverseProxyRules(config);
  return ensureRuleListResponse(data).find(rule => rule.ListenPort === port) || null;
}

function buildUpdatedSubRule(existingSubRule, {
  remark,
  serviceType,
  domains,
  locations,
  enable,
  advanced = {}
}) {
  return {
    ...existingSubRule,
    Enable: enable,
    Key: existingSubRule?.Key || '',
    GroupKey: existingSubRule?.GroupKey || '',
    Remark: remark,
    WebServiceType: serviceType,
    Domains: domains,
    Locations: locations,
    LocationInsecureSkipVerify: advanced.ignoreTlsVerify !== undefined ? advanced.ignoreTlsVerify !== false : existingSubRule?.LocationInsecureSkipVerify ?? true,
    EnableAccessLog: advanced.accessLog !== undefined ? advanced.accessLog !== false : existingSubRule?.EnableAccessLog ?? true,
    CorazaWAFInstance: advanced.waf !== undefined ? (advanced.waf ? 'default' : '') : existingSubRule?.CorazaWAFInstance ?? '',
    LogLevel: existingSubRule?.LogLevel ?? 4,
    LogOutputToConsole: existingSubRule?.LogOutputToConsole ?? false,
    AccessLogMaxNum: existingSubRule?.AccessLogMaxNum ?? 256,
    SafeIPMode: advanced.securityPresets !== undefined ? (advanced.securityPresets !== false ? 'blacklist' : 'none') : existingSubRule?.SafeIPMode ?? 'blacklist',
    SafeUserAgentMode: advanced.securityPresets !== undefined ? (advanced.securityPresets !== false ? 'blacklist' : 'none') : existingSubRule?.SafeUserAgentMode ?? 'blacklist',
    UserAgentfilter: existingSubRule?.UserAgentfilter ?? [],
    EasyLucky: advanced.securityPresets !== undefined ? advanced.securityPresets !== false : existingSubRule?.EasyLucky ?? true,
    FileServerShowDir: existingSubRule?.FileServerShowDir ?? true,
    FileServerIndexNames: existingSubRule?.FileServerIndexNames ?? 'index.html\nindex.htm',
    FileServerMountList: existingSubRule?.FileServerMountList ?? [],
    DisableKeepAlives: existingSubRule?.DisableKeepAlives ?? true,
    HttpClientTimeout: existingSubRule?.HttpClientTimeout ?? 10,
    OtherParams: existingSubRule?.OtherParams ?? {
      ProxyProtocolV2: true,
      UseTargetHost: advanced.useTargetHost !== undefined ? advanced.useTargetHost !== false : false,
      WebAuth: advanced.authentication?.enabled !== undefined ? Boolean(advanced.authentication?.enabled && advanced.authentication?.type === 'web') : false
    }
  };
}

/**
 * 智能创建或添加端口（带端口检查）
 * @param {number} port - 端口号
 * @param {string} name - 规则名称
 * @param {string} domain - 域名
 * @param {string} target - 目标地址
 * @param {Object} [options] - 其他选项
 * @returns {Promise<{ret: number, msg: string, action: string, portInfo?: Object}>}
 */
export async function smartCreateOrAddProxy(port, name, domain, target, options = {}, config = null) {
  // 0. ⚠️ 白名单安全检查
  try {
    checkPortWhitelist(port);
  } catch (error) {
    return {
      ret: -3,  // 特殊返回码表示端口不在白名单
      msg: error.message,
      action: 'port_not_allowed'
    };
  }

  // 1. 检查端口是否已存在
  const existingPort = await getPortDetail(port, config);

  if (existingPort) {
    // 端口已存在，返回信息让调用者决定如何处理
    return {
      ret: -2,  // 特殊返回码表示端口已存在
      msg: `端口 ${port} 已存在`,
      action: 'port_exists',
      portInfo: existingPort
    };
  }

  // 2. 端口不存在，创建新端口并添加代理
  const createResult = await createPort(port, name, options, config);
  if (createResult.ret !== 0) {
    return {
      ret: createResult.ret,
      msg: `创建端口失败: ${createResult.msg || '未知错误'}`,
      action: 'create_failed'
    };
  }

  const ruleKey = createResult.data?.ruleKey;
  if (!ruleKey) {
    return { ret: -1, msg: '创建端口成功但未返回ruleKey', action: 'create_no_key' };
  }

  // 3. 添加反向代理子规则
  const addResult = await addReverseProxy(ruleKey, name, domain, target, config);

  return {
    ret: addResult.ret,
    msg: addResult.ret === 0 ? '✅ 端口和反向代理创建成功' : '⚠️ 端口创建成功但添加反向代理失败',
    action: 'created',
    data: { ruleKey }
  };
}

/**
 * 创建端口并添加反向代理（一步到位，旧版，保留兼容）
 * @param {number} port - 端口号
 * @param {string} name - 规则名称
 * @param {string} domain - 域名
 * @param {string} target - 目标地址
 * @param {Object} [options] - 其他选项
 * @returns {Promise<{ret: number, msg: string, data?: {ruleKey: string}}>}
 */
export async function createPortWithProxy(port, name, domain, target, options = {}, config = null) {
  // 1. 创建端口
  const createResult = await createPort(port, name, options, config);
  if (createResult.ret !== 0) {
    return createResult;
  }

  const ruleKey = createResult.data?.ruleKey;
  if (!ruleKey) {
    return { ret: -1, msg: '创建端口成功但未返回ruleKey' };
  }

  // 2. 添加反向代理子规则
  const addResult = await addReverseProxy(ruleKey, name, domain, target, config);

  return {
    ret: addResult.ret,
    msg: addResult.ret === 0 ? '端口和反向代理创建成功' : '端口创建成功但添加反向代理失败',
    data: { ruleKey }
  };
}

/**
 * 批量创建端口
 * @param {Array<{port: number, name: string}>} portsConfig - 端口配置数组
 * @returns {Promise<Array<{port: number, success: boolean, msg: string}>>}
 */
export async function createPortsBatch(portsConfig) {
  const results = [];

  for (const config of portsConfig) {
    try {
      const result = await createPort(config.port, config.name, config.options || {});
      results.push({
        port: config.port,
        success: result.ret === 0,
        msg: result.msg || (result.ret === 0 ? '成功' : '失败')
      });
    } catch (error) {
      results.push({
        port: config.port,
        success: false,
        msg: error.message
      });
    }
  }

  return results;
}

/**
 * 删除多个端口
 * @param {number[]} ports - 端口号数组
 * @returns {Promise<Array<{port: number, success: boolean, msg: string}>>}
 */
export async function deletePortsBatch(ports) {
  const results = [];

  for (const port of ports) {
    try {
      const result = await deletePort(port);
      results.push({
        port,
        success: result.ret === 0,
        msg: result.msg || (result.ret === 0 ? '成功' : '失败')
      });
    } catch (error) {
      results.push({
        port,
        success: false,
        msg: error.message
      });
    }
  }

  return results;
}

/**
 * 根据名称查找端口
 * @param {string} name - 规则名称
 * @returns {Promise<Object|null>} 端口信息
 */
export async function findPortByName(name, config = null) {
  const ports = await listAllPorts(config);
  return ports.find(p => p.name === name) || null;
}

/**
 * 根据域名查找端口
 * @param {string} domain - 域名
 * @returns {Promise<Array>} 匹配的端口列表
 */
export async function findPortsByDomain(domain, config = null) {
  const ports = await listAllPorts(config);
  return ports.filter(p =>
    p.subRules.some(sub =>
      sub.domains && sub.domains.includes(domain)
    )
  );
}

/**
 * 获取所有反向代理列表（扁平化）
 * @returns {Promise<Array>} 所有反向代理列表
 */
export async function getAllProxies(config = null) {
  const ports = await listAllPorts(config);
  const proxies = [];

  for (const port of ports) {
    for (const sub of port.subRules) {
      if (sub.type === 'reverseproxy') {
        proxies.push({
          port: port.port,
          portName: port.name,
          network: port.network,
          enableTLS: port.tls,
          remark: sub.name,
          domains: sub.domains,
          target: sub.targets[0],
          enabled: port.enabled && sub.enabled,
          rawAdvanced: sub.rawAdvanced || {}
        });
      }
    }
  }

  return proxies;
}

/**
 * 搜索反向代理
 * @param {string} keyword - 关键词（匹配域名、备注或端口名）
 * @returns {Promise<Array>} 匹配的反向代理列表
 */
export async function searchProxies(keyword, config = null) {
  const proxies = await getAllProxies(config);
  const lowerKeyword = keyword.toLowerCase();

  return proxies.filter(p =>
    (p.domains && p.domains.some(d => d.toLowerCase().includes(lowerKeyword))) ||
    (p.remark && p.remark.toLowerCase().includes(lowerKeyword)) ||
    (p.portName && p.portName.toLowerCase().includes(lowerKeyword))
  );
}

/**
 * 获取端口统计信息
 * @returns {Promise<Object>} 统计信息
 */
export async function getPortStats(config = null) {
  const ports = await listAllPorts(config);

  return {
    totalPorts: ports.length,
    enabledPorts: ports.filter(p => p.enabled).length,
    disabledPorts: ports.filter(p => !p.enabled).length,
    totalSubRules: ports.reduce((sum, p) => sum + p.subRuleCount, 0),
    byNetwork: {
      tcp4: ports.filter(p => p.network === 'tcp4').length,
      tcp6: ports.filter(p => p.network === 'tcp6').length,
      tcp: ports.filter(p => p.network === 'tcp').length
    },
    byType: {
      reverseproxy: ports.reduce((sum, p) => sum + p.subRules.filter(s => s.type === 'reverseproxy').length, 0),
      redirect: ports.reduce((sum, p) => sum + p.subRules.filter(s => s.type === 'redirect').length, 0),
      fileserver: ports.reduce((sum, p) => sum + p.subRules.filter(s => s.type === 'fileserver').length, 0)
    }
  };
}

/**
 * 导出端口配置为JSON
 * @param {number} [port] - 指定端口，不指定则导出所有
 * @returns {Promise<string>} JSON字符串
 */
export async function exportPortsConfig(port, config = null) {
  if (port) {
    const detail = await getPortDetail(port, config);
    return JSON.stringify(detail, null, 2);
  }
  const ports = await listAllPorts(config);
  return JSON.stringify(ports, null, 2);
}

// ==================== 子规则智能管理 ====================

/**
 * 在端口中查找同名子规则
 * @param {Object} portInfo - 端口信息
 * @param {string} remark - 子规则名称
 * @returns {Object|null} 找到的子规则或null
 */
export function findSubRuleByName(portInfo, remark) {
  if (!portInfo.subRules) return null;
  return portInfo.subRules.find(sub => sub.name === remark) || null;
}

/**
 * 智能添加或更新子规则
 * @param {number} port - 端口号
 * @param {string} remark - 子规则名称
 * @param {string} serviceType - 服务类型 (reverseproxy/redirect/fileserver)
 * @param {string[]} domains - 域名列表
 * @param {string[]} locations - 目标地址列表
 * @param {Object} options - 其他选项
 * @returns {Promise<{ret: number, msg: string, action: string}>}
 */
export async function smartAddOrUpdateSubRule(port, remark, serviceType, domains, locations, options = {}, config = null) {
  // 1. 白名单检查
  try {
    checkPortWhitelist(port);
  } catch (error) {
    return {
      ret: -3,
      msg: error.message,
      action: 'port_not_allowed'
    };
  }

  // 2. 获取端口原始规则
  const rawRule = await getRawRuleByPort(port, config);
  if (!rawRule) {
    return {
      ret: -1,
      msg: `端口 ${port} 的原始规则不存在`,
      action: 'port_not_found'
    };
  }

  // 3. 检查是否存在同名子规则
  const existingSubRule = (rawRule.ProxyList || []).find(sub => sub.Remark === remark) || null;

  if (existingSubRule) {
    const newProxyList = (rawRule.ProxyList || []).map(sub =>
      sub.Key === existingSubRule.Key
        ? buildUpdatedSubRule(sub, {
            remark,
            serviceType,
            domains,
            locations,
            enable: options.enable !== undefined ? options.enable : sub.Enable,
            advanced: options.advanced || {}
          })
        : sub
    );

    // 更新规则
    const updateResult = await updateRule({
      ruleKey: rawRule.RuleKey,
      ruleName: rawRule.RuleName,
      listenPort: rawRule.ListenPort,
      network: rawRule.Network,
      listenIP: rawRule.ListenIP || '',
      enable: rawRule.Enable,
      enableTLS: rawRule.EnableTLS,
      proxyList: newProxyList,
      sourceRule: rawRule
    }, config);

    if (updateResult.ret === 0) {
      return {
        ret: 0,
        msg: `✅ 子规则 "${remark}" 已更新`,
        action: 'updated',
        data: {
          oldConfig: existingSubRule,
          port: port
        }
      };
    } else {
      return {
        ret: updateResult.ret,
        msg: `❌ 更新失败: ${updateResult.msg}`,
        action: 'update_failed'
      };
    }
  } else {
    // 子规则不存在，添加新规则
    const addResult = await addSubRule(rawRule.RuleKey, {
      remark,
      serviceType,
      domains,
      locations,
      enable: options.enable !== undefined ? options.enable : true,
      advanced: options.advanced || {}
    }, config);

    if (addResult.ret === 0) {
      return {
        ret: 0,
        msg: `✅ 子规则 "${remark}" 已添加`,
        action: 'added',
        data: { port }
      };
    } else {
      return {
        ret: addResult.ret,
        msg: `❌ 添加失败: ${addResult.msg}`,
        action: 'add_failed'
      };
    }
  }
}

/**
 * 打印端口列表（美化输出）
 * @returns {Promise<void>}
 */
export async function printPortList() {
  const ports = await listAllPorts();

  console.log('\n=== Lucky Web服务端口列表 ===\n');

  if (ports.length === 0) {
    console.log('暂无端口规则');
    return;
  }

  ports.forEach((p, index) => {
    const status = p.enabled ? '✅' : '❌';
    const tls = p.tls ? '🔒' : '  ';
    const network = p.network === 'tcp4' ? 'IPv4' : p.network === 'tcp6' ? 'IPv6' : 'Both';

    console.log(`${index + 1}. ${status} ${tls} 端口 ${p.port} (${network}) - ${p.name}`);
    console.log(`   Key: ${p.key}`);
    console.log(`   IP: ${p.ip}`);
    console.log(`   子规则: ${p.subRuleCount} 个`);

    if (p.subRules.length > 0) {
      p.subRules.forEach((sub, i) => {
        const subStatus = sub.enabled ? '✓' : '✗';
        const typeIcon = sub.type === 'reverseproxy' ? '🔄' : sub.type === 'redirect' ? '↪️' : '📁';
        const domains = sub.domains?.join(', ') || '无';
        const targets = sub.targets?.join(', ') || '无';

        console.log(`      ${i + 1}. ${subStatus} ${typeIcon} ${sub.name || '未命名'}`);
        console.log(`         类型: ${sub.type}`);
        console.log(`         域名: ${domains}`);
        console.log(`         目标: ${targets}`);
      });
    }
    console.log('');
  });

  const stats = await getPortStats();
  console.log(`总计: ${stats.totalPorts} 个端口 | ${stats.enabledPorts} 开启 | ${stats.disabledPorts} 关闭`);
  console.log(`子规则: ${stats.totalSubRules} 个`);
  console.log(`网络类型: IPv4:${stats.byNetwork.tcp4} | IPv6:${stats.byNetwork.tcp6} | Both:${stats.byNetwork.tcp}`);
}

// 导出便捷的函数集合
export const PortManager = {
  list: listAllPorts,
  get: getPortDetail,
  findByName: findPortByName,
  findByDomain: findPortsByDomain,
  create: createPort,
  createWithProxy: createPortWithProxy,
  smartCreateOrAddProxy: smartCreateOrAddProxy,  // 智能创建（带端口检查）
  update: updateRule,
  delete: deletePort,
  deleteByName: deleteRuleByName,
  addProxy: addReverseProxy,
  addRedirect: addRedirect,
  addFileServer: addFileServer,
  smartAddOrUpdateSubRule: smartAddOrUpdateSubRule,  // 智能添加/更新子规则
  getAllProxies,
  searchProxies,
  getStats: getPortStats,
  export: exportPortsConfig,
  print: printPortList,
  // 安全检查函数
  isPortAllowed: isPortAllowed,
  checkPortWhitelist: checkPortWhitelist,
  getWhitelistStatus: getWhitelistStatus
};
