// Lucky 反向代理模块 API 配置（支持 OpenToken 和 Admin Token 认证）
import { openTokenFetch, getApiBaseUrl } from './lucky-api.mjs';

// ==================== 反向代理 API ====================

/** @deprecated Use per-call config instead */
export const REVERSE_PROXY_API = {
  getRules: `${getApiBaseUrl()}/api/webservice/rules`,
  getStats: `${getApiBaseUrl()}/api/webservice/tipinfo`,
  getSettings: `${getApiBaseUrl()}/api/webservice/modulesettings/frontend`,
  getGroups: `${getApiBaseUrl()}/api/webservice/groups`,
  setRules: `${getApiBaseUrl()}/api/webservice/rules`,
};

// ==================== 数据类型 ====================

/**
 * 反向代理规则结构
 * @typedef {Object} ReverseProxyRule
 * @property {string} Key - 规则唯一标识
 * @property {string} Remark - 备注/名称
 * @property {string[]} Domains - 域名列表
 * @property {string[]} Locations - 目标地址列表 (如 ["http://192.168.9.200:5666"])
 * @property {boolean} Enable - 是否启用
 * @property {string} WebServiceType - 服务类型: "reverseproxy" | "redirect" | "fileserver"
 * @property {boolean} EnableBasicAuth - 是否启用基础认证
 * @property {boolean} WebAuth - 是否启用Web认证
 * @property {string} SafeIPMode - IP安全模式: "blacklist" | "whitelist"
 * @property {string} SafeUserAgentMode - UserAgent安全模式
 */

/**
 * 监听规则结构
 * @typedef {Object} ListenRule
 * @property {string} RuleKey - 规则唯一标识
 * @property {string} RuleName - 规则名称
 * @property {string} Network - 网络类型: "tcp4" | "tcp6" | "tcp"
 * @property {string} ListenIP - 监听IP
 * @property {number} ListenPort - 监听端口
 * @property {boolean} EnableTLS - 是否启用TLS
 * @property {boolean} Enable - 是否启用
 * @property {Object} DefaultProxy - 默认代理配置
 * @property {Object[]} ProxyList - 代理规则列表
 */

// ==================== API 函数 ====================

/**
 * 获取所有反向代理规则
 * @returns {Promise<{ret: number, ruleList: ListenRule[]}>}
 */
export async function getReverseProxyRules(config = null) {
  return await openTokenFetch('/api/webservice/rules', {}, config);
}

function ensureRuleListResponse(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Lucky API 返回了无效响应');
  }

  if (data.ret !== 0) {
    throw new Error(`Lucky API 错误 ${data.ret}: ${data.msg || '未知错误'}`);
  }

  // ruleList 为 null 表示尚未创建任何规则，视为空列表
  return Array.isArray(data.ruleList) ? data.ruleList : [];
}

/**
 * 获取统计信息
 * @returns {Promise<Object>}
 */
export async function getReverseProxyStats(config = null) {
  return await openTokenFetch('/api/webservice/tipinfo', {}, config);
}

/**
 * 获取模块设置
 * @returns {Promise<Object>}
 */
export async function getReverseProxySettings(config = null) {
  return await openTokenFetch('/api/webservice/modulesettings/frontend', {}, config);
}

/**
 * 获取分组列表
 * @returns {Promise<Object>}
 */
export async function getReverseProxyGroups(config = null) {
  return await openTokenFetch('/api/webservice/groups', {}, config);
}

// ==================== 工具函数 ====================

/**
 * 从规则列表中提取所有反向代理规则
 * @param {ListenRule[]} ruleList - 规则列表
 * @returns {ReverseProxyRule[]} 仅包含反向代理类型的规则
 */
export function extractReverseProxies(ruleList) {
  const proxies = [];
  for (const rule of ruleList) {
    if (rule.ProxyList) {
      for (const proxy of rule.ProxyList) {
        if (proxy.WebServiceType === 'reverseproxy') {
          proxies.push({
            ...proxy,
            listenPort: rule.ListenPort,
            enableTLS: rule.EnableTLS,
            network: rule.Network
          });
        }
      }
    }
  }
  return proxies;
}

/**
 * 根据域名查找反向代理规则
 * @param {ListenRule[]} ruleList - 规则列表
 * @param {string} domain - 域名
 * @returns {ReverseProxyRule|null} 找到的规则或null
 */
export function findProxyByDomain(ruleList, domain) {
  const proxies = extractReverseProxies(ruleList);
  return proxies.find(p => p.Domains && p.Domains.includes(domain)) || null;
}

/**
 * 根据备注查找反向代理规则
 * @param {ListenRule[]} ruleList - 规则列表
 * @param {string} remark - 备注
 * @returns {ReverseProxyRule|null} 找到的规则或null
 */
export function findProxyByRemark(ruleList, remark) {
  const proxies = extractReverseProxies(ruleList);
  return proxies.find(p => p.Remark === remark) || null;
}

/**
 * 格式化显示反向代理规则
 * @param {ReverseProxyRule} proxy - 代理规则
 * @returns {string} 格式化的字符串
 */
export function formatProxyRule(proxy) {
  const domains = proxy.Domains ? proxy.Domains.join(', ') : 'N/A';
  const locations = proxy.Locations ? proxy.Locations.join(', ') : 'N/A';
  const status = proxy.Enable ? '✓' : '✗';

  return `
${proxy.Remark || '未命名'}
  状态: ${status}
  域名: ${domains}
  目标: ${locations}
  Key: ${proxy.Key}
  `.trim();
}

/**
 * 列出所有反向代理规则（格式化输出）
 * @param {ListenRule[]} ruleList - 规则列表
 * @returns {string} 格式化的所有规则
 */
export function listAllProxies(ruleList) {
  const proxies = extractReverseProxies(ruleList);
  return proxies.map(p => formatProxyRule(p)).join('\n\n');
}

// ==================== 示例配置 ====================

/**
 * 创建新的反向代理规则的模板
 * @param {Object} config - 配置对象
 * @returns {Object} 代理规则对象
 */
export function createProxyTemplate({
  remark = '',
  domains = [],
  locations = [],
  enable = true
} = {}) {
  return {
    Key: '', // 需要服务端生成
    GroupKey: '',
    WebServiceType: 'reverseproxy',
    Enable: enable,
    Locations: locations,
    FileServerMountList: [],
    EnableBasicAuth: false,
    WebAuth: false,
    BasicAuthUserList: '',
    SafeIPMode: 'blacklist',
    SafeUserAgentMode: 'blacklist',
    Remark: remark,
    Domains: domains,
    CustomOutputText: '',
    LastErrMsg: '',
    CacheEnabled: false,
    CaCheTotalSize: 0,
    CacheFilesTotal: 0,
    DisplayInFrontendList: false,
    CorazaWAF: false,
    OtherParams: null
  };
}

// ==================== 导出便捷函数 ====================

/**
 * 获取并解析所有反向代理
 * @returns {Promise<ReverseProxyRule[]>}
 */
export async function getAllReverseProxies(config = null) {
  const data = await getReverseProxyRules(config);
  return extractReverseProxies(ensureRuleListResponse(data));
}

/**
 * 快速查找某个域名的代理目标
 * @param {string} domain - 域名
 * @returns {Promise<string|null>} 目标地址或null
 */
export async function findTargetForDomain(domain, config = null) {
  const data = await getReverseProxyRules(config);
  const proxy = findProxyByDomain(ensureRuleListResponse(data), domain);
  return proxy ? proxy.Locations?.[0] || null : null;
}

/**
 * 创建新的Web服务监听规则（添加新端口）
 * @param {Object} config - 配置对象
 * @param {string} config.ruleName - 规则名称
 * @param {number} config.listenPort - 监听端口
 * @param {string} [config.network] - 网络类型: "tcp4" | "tcp6" | "tcp" (默认: "tcp6")
 * @param {string} [config.listenIP] - 监听IP (默认: "" 所有地址)
 * @param {boolean} [config.enable] - 是否启用 (默认: true)
 * @param {boolean} [config.enableTLS] - 是否启用TLS (默认: false)
 * @param {boolean} [config.autoFirewall] - 防火墙自动放行 (默认: true)
 * @returns {Promise<{ret: number, msg: string}>}
 */
export async function createListenRule({
  ruleName,
  listenPort,
  network = 'tcp6',
  listenIP = '',
  enable = true,
  enableTLS = false,
  autoFirewall = true
}, config = null) {
  const requestBody = {
    RuleName: ruleName,
    RuleKey: '',
    DiaglogShowMode: 'simple',
    Enable: enable,
    Network: network,
    CorazaWAFInstance: '',
    ListenIP: listenIP,
    ListenPort: listenPort,
    AutoOptionsFirewall: autoFirewall,
    EnableTLS: enableTLS,
    TLSMinVersion: 2,
    MaxHeaderKBytes: 32,
    IPFilterRule: 'disable',
    MaxContinuous404Count: 0,
    MaxCorazaInterceptionCount: 0,
    SendRateLimitEnabled: false,
    SendRateLimit: 0,
    ReceRateLimitEnabled: false,
    ReceRateLimit: 0,
    SingleConnSendRateLimitEnabled: false,
    SingleConnSendRateLimit: 0,
    SingleConnReceRateLimitEnabled: false,
    SingleConnReceRateLimit: 0,
    GlobalAllowAllThirdAuthUsers: false,
    GlobalThirdAuthLoginUserList: [],
    GlobalAllowThirdUserSkipTwoFA: false,
    SingleIPSendRateLimitEnabled: false,
    SingleIPSendRateLimit: 0,
    SingleIPReceRateLimitEnabled: false,
    SingleIPReceRateLimit: 0,
    Http3: false,
    GlobalBasicAuthUserList: '',
    ECH: false,
    ECHDomain: '',
    ECDHPrivateKey: '',
    ECHConfigList: '',
    DefaultProxy: {
      Key: 'default',
      WebServiceType: 'reverseproxy',
      CorazaWAFInstance: '',
      Locations: [],
      LocationInsecureSkipVerify: true,
      EnableAccessLog: true,
      LogLevel: 4,
      LogOutputToConsole: false,
      AccessLogMaxNum: 256,
      WebListShowLastLogMaxCount: 10,
      RequestInfoLogFormat: '[#{clientIP}][#{remoteIP}]#{tab}[#{method}][#{host}#{url}]',
      ForwardedByClientIP: false,
      TrustedCIDRsStrList: [],
      UseRuleGlobalAuthSettings: false,
      UseTargetHost: false,
      DisableLongConnection: false,
      CustomCrossDomain: '',
      CustomCrossMethods: '',
      RemoteIPHeaders: ['X-Forwarded-For', 'X-Real-IP'],
      AddRemoteIPToHeader: false,
      AddRemoteIPHeaderKey: '',
      EnableCrossDomain: false,
      EnableBasicAuth: false,
      BasicAuthRegConf: '',
      BasicAuthUser: '',
      BasicAuthPasswd: '',
      BasicAuthUserList: '',
      BasicAuthMaxLoginErrorCount: 0,
      SafeIPMode: 'blacklist',
      SafeUserAgentMode: 'blacklist',
      UserAgentfilter: [''],
      CustomRobotTxt: false,
      RobotTxt: 'User-agent:  *\nDisallow:  /',
      AddProtoToHeader: false,
      ProtoHeaderKey: '',
      EasyLucky: false,
      FileServerShowDir: true,
      CacheBodyOnlyPath: '',
      FileServerIndexNames: 'index.html\n',
      FileServerHideFiles: '',
      FileServerForbiddenPaths: '',
      FileServerMountList: [],
      fileServerCollapsectiveName: 0,
      NginxConf: '',
      CustomOutputText: '',
      DisableHTTP3: false,
      MaxContinuous404Count: 0,
      MaxCorazaInterceptionCount: 0,
      HttpClientNetwork: 'tcp',
      DisableKeepAlives: true,
      HttpClientTimeout: 10,
      ProxyType: '',
      ProxyAddr: '',
      ProxyUser: '',
      ProxyPassword: '',
      AutoProxyLocation: false,
      AutoProxyLocationWithoutSameHost: false,
      CacheEnabled: false,
      CachePath: '',
      CacheKey: '',
      CacheLimit: 0,
      CacheBodyMinLimit: 0,
      CacheBodyMaxLimit: 0,
      CacheOnlyKeyReg: '',
      CacheValidityPeriod: 0,
      DealCacheBeforeReverseProxy: true,
      GRPCSecureConnection: false,
      CertificateSyncToken: '',
      OtherParams: {
        ProxyProtocolV2: true,
        SpeedTestFrontSource: '',
        OauthType: 'github',
        OauthClientID: '',
        OauthClientSecret: '',
        OauthClientKey: '',
        OauthRedirectURI: '',
        OauthServer: '',
        HttpClientProxyType: '',
        HttpClientProxyAddr: '',
        HttpClientProxyUser: '',
        HttpClientProxyPassword: '',
        WebAuth: false,
        AllowAllThirdAuthUsers: false,
        AllowThirdUserList: [],
        AllowThirdUserSkipTwoFA: false
      }
    },
    ProxyList: []
  };

  return await openTokenFetch('/api/webservice/rules', {
    method: 'POST',
    body: JSON.stringify(requestBody)
  }, config);
}

/**
 * 快速创建新端口（便捷函数）
 * @param {number} port - 端口号
 * @param {string} [name] - 规则名称 (默认: "${port}端口")
 * @param {Object} [options] - 其他选项
 * @returns {Promise<{ret: number, msg: string}>}
 */
export async function createPort(port, name, options = {}, config = null) {
  return createListenRule({
    ruleName: name || `${port}端口`,
    listenPort: port,
    ...options
  }, config);
}

// ==================== 更新规则（含子规则）====================

/**
 * 更新Web服务规则（包含子规则）
 * @param {Object} config - 配置对象
 * @param {string} config.ruleKey - 规则的唯一标识
 * @param {string} config.ruleName - 规则名称
 * @param {number} config.listenPort - 监听端口
 * @param {string} [config.network] - 网络类型
 * @param {string} [config.listenIP] - 监听IP
 * @param {boolean} [config.enable] - 是否启用
 * @param {boolean} [config.enableTLS] - 是否启用TLS
 * @param {Object[]} [config.proxyList] - 子规则列表
 * @param {Object|null} [config.sourceRule] - 已存在的完整规则对象，用于保留未修改的字段
 * @returns {Promise<{ret: number, msg: string}>}
 */
export async function updateRule({
  ruleKey,
  ruleName,
  listenPort,
  network = 'tcp6',
  listenIP = '',
  enable = true,
  enableTLS = false,
  proxyList = [],
  sourceRule = null
}, config = null) {
  const requestBody = {
    RuleName: ruleName,
    RuleKey: ruleKey,
    DiaglogShowMode: sourceRule?.DiaglogShowMode ?? 'simple',
    Enable: enable,
    Network: network,
    ListenIP: listenIP,
    ListenPort: listenPort,
    AutoOptionsFirewall: sourceRule?.AutoOptionsFirewall ?? true,
    EnableTLS: enableTLS,
    TLSMinVersion: sourceRule?.TLSMinVersion ?? 2,
    MaxHeaderKBytes: sourceRule?.MaxHeaderKBytes ?? 32,
    IPFilterRule: sourceRule?.IPFilterRule ?? 'disable',
    MaxContinuous404Count: sourceRule?.MaxContinuous404Count ?? 0,
    MaxCorazaInterceptionCount: sourceRule?.MaxCorazaInterceptionCount ?? 0,
    Http3: sourceRule?.Http3 ?? false,
    ECH: sourceRule?.ECH ?? false,
    ECHDomain: sourceRule?.ECHDomain ?? '',
    ECDHPrivateKey: sourceRule?.ECDHPrivateKey ?? '',
    ECHConfigList: sourceRule?.ECHConfigList ?? '',
    SendRateLimitEnabled: sourceRule?.SendRateLimitEnabled ?? false,
    SendRateLimit: sourceRule?.SendRateLimit ?? 0,
    ReceRateLimitEnabled: sourceRule?.ReceRateLimitEnabled ?? false,
    ReceRateLimit: sourceRule?.ReceRateLimit ?? 0,
    SingleConnSendRateLimitEnabled: sourceRule?.SingleConnSendRateLimitEnabled ?? false,
    SingleConnSendRateLimit: sourceRule?.SingleConnSendRateLimit ?? 0,
    SingleConnReceRateLimitEnabled: sourceRule?.SingleConnReceRateLimitEnabled ?? false,
    SingleConnReceRateLimit: sourceRule?.SingleConnReceRateLimit ?? 0,
    SingleIPSendRateLimitEnabled: sourceRule?.SingleIPSendRateLimitEnabled ?? false,
    SingleIPSendRateLimit: sourceRule?.SingleIPSendRateLimit ?? 0,
    SingleIPReceRateLimitEnabled: sourceRule?.SingleIPReceRateLimitEnabled ?? false,
    SingleIPReceRateLimit: sourceRule?.SingleIPReceRateLimit ?? 0,
    SingleIPConnectionsLimitEnabled: sourceRule?.SingleIPConnectionsLimitEnabled ?? false,
    SingleIPConnectionsLimit: sourceRule?.SingleIPConnectionsLimit ?? 0,
    GlobalBasicAuthUserList: sourceRule?.GlobalBasicAuthUserList ?? '',
    GlobalAllowAllThirdAuthUsers: sourceRule?.GlobalAllowAllThirdAuthUsers ?? false,
    GlobalAllowThirdUserSkipTwoFA: sourceRule?.GlobalAllowThirdUserSkipTwoFA ?? false,
    GlobalThirdAuthLoginUserList: sourceRule?.GlobalThirdAuthLoginUserList ?? null,
    ProxyList: proxyList,
    DefaultProxy: sourceRule?.DefaultProxy ?? createDefaultProxy(ruleKey)
  };

  return await openTokenFetch(`/api/webservice/rule/${ruleKey}`, {
    method: 'PUT',
    body: JSON.stringify(requestBody)
  }, config);
}

/**
 * 创建默认代理配置
 * @returns {Object} 默认代理对象
 */
function createDefaultProxy(ruleKey = 'default') {
  return {
    Key: ruleKey,
    WebServiceType: 'reverseproxy',
    Locations: [],
    LocationInsecureSkipVerify: true,
    EnableAccessLog: true,
    LogLevel: 4,
    LogOutputToConsole: false,
    AccessLogMaxNum: 256,
    ForwardedByClientIP: false,
    SafeIPMode: 'blacklist',
    SafeUserAgentMode: 'blacklist'
  };
}

// ==================== 添加子规则 ====================

/**
 * 添加子规则到指定端口
 * @param {string} ruleKey - 规则的唯一标识
 * @param {Object} subRule - 子规则配置
 * @param {string} subRule.remark - 备注/名称
 * @param {string} subRule.serviceType - 服务类型: "reverseproxy" | "redirect" | "fileserver"
 * @param {string[]} subRule.domains - 前端域名列表
 * @param {string[]} subRule.locations - 后端地址列表
 * @param {boolean} [subRule.enable] - 是否启用
 * @returns {Promise<{ret: number, msg: string}>}
 */
export async function addSubRule(ruleKey, {
  remark,
  serviceType = 'reverseproxy',
  domains = [],
  locations = [],
  enable = true,
  advanced = {}
}, config = null) {
  // 先获取当前规则
  const rulesData = await getReverseProxyRules(config);
  const rule = ensureRuleListResponse(rulesData).find(r => r.RuleKey === ruleKey);

  if (!rule) {
    throw new Error(`Rule with key ${ruleKey} not found`);
  }

  // 创建新的子规则对象
  const newSubRule = {
    Enable: enable,
    Key: '',
    Remark: remark,
    WebServiceType: serviceType,
    Domains: domains,
    Locations: locations,
    LocationInsecureSkipVerify: advanced.ignoreTlsVerify !== false,
    EnableAccessLog: advanced.accessLog !== false,
    CorazaWAFInstance: advanced.waf ? 'default' : '',
    LogLevel: 4,
    LogOutputToConsole: false,
    AccessLogMaxNum: 256,
    SafeIPMode: 'blacklist',
    SafeUserAgentMode: 'blacklist',
    UserAgentfilter: [],
    EasyLucky: advanced.securityPresets !== false,
    FileServerShowDir: true,
    FileServerIndexNames: 'index.html\nindex.htm',
    FileServerMountList: [],
    DisableKeepAlives: true,
    HttpClientTimeout: 10,
    OtherParams: {
      ProxyProtocolV2: true,
      UseTargetHost: advanced.useTargetHost !== false,
      WebAuth: Boolean(advanced.authentication?.enabled && advanced.authentication?.type === 'web')
    }
  };

  // 添加到现有子规则列表
  const proxyList = [...(rule.ProxyList || []), newSubRule];

  // 更新规则
  return updateRule({
    ruleKey: rule.RuleKey,
    ruleName: rule.RuleName,
    listenPort: rule.ListenPort,
    network: rule.Network,
    listenIP: rule.ListenIP || '',
    enable: rule.Enable,
    enableTLS: rule.EnableTLS,
    proxyList: proxyList,
    sourceRule: rule
  }, config);
}

/**
 * 快速添加反向代理子规则
 * @param {string} ruleKey - 规则的唯一标识
 * @param {string} remark - 备注
 * @param {string} domain - 前端域名
 * @param {string} target - 后端目标地址
 * @returns {Promise<{ret: number, msg: string}>}
 */
export async function addReverseProxy(ruleKey, remark, domain, target, config = null, opts = {}) {
  return addSubRule(ruleKey, {
    remark,
    serviceType: 'reverseproxy',
    domains: [domain],
    locations: [target],
    advanced: opts.advanced || {}
  }, config);
}

/**
 * 快速添加重定向子规则
 * @param {string} ruleKey - 规则的唯一标识
 * @param {string} remark - 备注
 * @param {string} fromDomain - 源域名
 * @param {string} toUrl - 目标URL
 * @returns {Promise<{ret: number, msg: string}>}
 */
export async function addRedirect(ruleKey, remark, fromDomain, toUrl, config = null) {
  return addSubRule(ruleKey, {
    remark,
    serviceType: 'redirect',
    domains: [fromDomain],
    locations: [toUrl]
  }, config);
}

/**
 * 快速添加文件服务子规则
 * @param {string} ruleKey - 规则的唯一标识
 * @param {string} remark - 备注
 * @param {string} domain - 域名
 * @param {string} storagePath - 存储路径
 * @returns {Promise<{ret: number, msg: string}>}
 */
export async function addFileServer(ruleKey, remark, domain, storagePath, config = null) {
  return addSubRule(ruleKey, {
    remark,
    serviceType: 'fileserver',
    domains: [domain],
    locations: [storagePath]
  }, config);
}

// ==================== 删除规则/端口 ====================

/**
 * 根据 RuleKey 获取规则详情
 * @param {string} ruleKey - 规则的唯一标识
 * @returns {Promise<ListenRule|null>}
 */
export async function getRuleByKey(ruleKey, config = null) {
  const data = await getReverseProxyRules(config);
  const rules = ensureRuleListResponse(data);
  return rules.find(rule => rule.RuleKey === ruleKey) || null;
}

/**
 * 删除指定域名的子规则
 * @param {string} ruleKey - 规则的唯一标识
 * @param {string} domain - 要删除的域名
 * @returns {Promise<{ret: number, msg: string, deleted: boolean}>}
 */
export async function deleteSubRuleByDomain(ruleKey, domain, config = null) {
  console.log(`[Lucky] 开始删除子规则: ruleKey=${ruleKey}, domain=${domain}`);

  // 获取规则详情
  const rule = await getRuleByKey(ruleKey, config);
  if (!rule) {
    console.log(`[Lucky] ❌ 规则未找到: ${ruleKey}`);
    return { ret: 1, msg: `Rule ${ruleKey} not found`, deleted: false };
  }

  console.log(`[Lucky] 找到规则: ${rule.RuleName}, 当前有 ${rule.ProxyList?.length || 0} 个子规则`);

  // 过滤掉要删除的子规则
  const originalCount = rule.ProxyList?.length || 0;
  const filteredProxyList = (rule.ProxyList || []).filter(proxy => {
    const proxyDomain = proxy.Domains?.[0];  // 注意是 Domains（复数）
    return proxyDomain !== domain;
  });

  // 如果没有变化，说明域名不存在
  if (filteredProxyList.length === originalCount) {
    console.log(`[Lucky] ❌ 域名未找到: ${domain}`);
    return { ret: 1, msg: `Domain ${domain} not found in rule`, deleted: false };
  }

  console.log(`[Lucky] 过滤后剩余 ${filteredProxyList.length} 个子规则，准备更新`);

  // 更新规则
  const result = await updateRule({
    ruleKey: rule.RuleKey,
    ruleName: rule.RuleName,
    listenPort: rule.ListenPort,
    network: rule.Network,
    listenIP: rule.ListenIP || '',
    enable: rule.Enable,
    enableTLS: rule.EnableTLS,
    proxyList: filteredProxyList,
    sourceRule: rule
  }, config);

  if (result.ret === 0) {
    console.log(`[Lucky] ✅ 成功删除子规则: ${domain}`);
  } else {
    console.log(`[Lucky] ❌ 删除子规则失败: ${result.msg}`);
  }

  return { ...result, deleted: result.ret === 0 };
}

/**
 * 删除Web服务规则（端口）
 * @param {string} ruleKey - 规则的唯一标识
 * @returns {Promise<{ret: number, msg: string}>}
 */
export async function deleteRule(ruleKey, config = null) {
  return await openTokenFetch(`/api/webservice/rule/${ruleKey}`, {
    method: 'DELETE'
  }, config);
}

/**
 * 根据端口删除规则
 * @param {number} port - 端口号
 * @returns {Promise<{ret: number, msg: string}>}
 */
export async function deletePort(port, config = null) {
  const data = await getReverseProxyRules(config);
  const rule = ensureRuleListResponse(data).find(r => r.ListenPort === port);

  if (!rule) {
    throw new Error(`Port ${port} not found`);
  }

  return deleteRule(rule.RuleKey, config);
}

/**
 * 根据名称删除规则
 * @param {string} ruleName - 规则名称
 * @returns {Promise<{ret: number, msg: string}>}
 */
export async function deleteRuleByName(ruleName, config = null) {
  const data = await getReverseProxyRules(config);
  const rule = ensureRuleListResponse(data).find(r => r.RuleName === ruleName);

  if (!rule) {
    throw new Error(`Rule ${ruleName} not found`);
  }

  return deleteRule(rule.RuleKey, config);
}
