#!/usr/bin/env node
/**
 * Nginx Proxy Manager API 客户端
 * 支持静态 Token 或账号密码登录获取 JWT
 */

import { getEnv } from '../utils/env-loader.mjs';
import { pathToFileURL } from 'node:url';

const DEFAULT_API_BASE = 'http://192.168.3.200:50001';

const authCache = new Map();

const getApiBase = () => getEnv('NPM_API_BASE', DEFAULT_API_BASE).replace(/\/+$/u, '');
const getStaticToken = () => getEnv('NPM_API_TOKEN', '');
const getAuthIdentity = () => getEnv('NPM_API_EMAIL', getEnv('NPM_API_IDENTITY', ''));
const getAuthSecret = () => getEnv('NPM_API_PASSWORD', getEnv('NPM_API_SECRET', ''));

function normalizeApiBase(apiBase) {
  return `${apiBase || DEFAULT_API_BASE}`.replace(/\/+$/u, '');
}

function resolveConfig(config = null) {
  const overrides = config ?? {};

  return {
    apiBase: normalizeApiBase(overrides.apiBase ?? getApiBase()),
    apiToken: overrides.apiToken ?? getStaticToken(),
    apiEmail: overrides.apiEmail ?? overrides.apiIdentity ?? getAuthIdentity(),
    apiPassword: overrides.apiPassword ?? overrides.apiSecret ?? getAuthSecret()
  };
}

function getAuthCacheKey(apiBase, identity) {
  return `${apiBase}::${identity}`;
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/gu, '+').replace(/_/gu, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch (error) {
    return null;
  }
}

function getTokenExpiry(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) {
    return Date.now() + 55 * 60 * 1000;
  }

  return (payload.exp * 1000) - 60 * 1000;
}

function hasCachedToken(base, identity) {
  const cached = authCache.get(getAuthCacheKey(base, identity));
  return Boolean(cached?.token && cached.expiresAt > Date.now());
}

function getCachedToken(base, identity) {
  return authCache.get(getAuthCacheKey(base, identity))?.token ?? null;
}

function setCachedToken(base, identity, token) {
  authCache.set(getAuthCacheKey(base, identity), {
    token,
    expiresAt: getTokenExpiry(token)
  });
}

function resetCachedToken(base = null, identity = null) {
  if (base && identity) {
    authCache.delete(getAuthCacheKey(base, identity));
    return;
  }

  authCache.clear();
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }

  const text = await response.text();
  return text;
}

async function requestAuthToken(config = null) {
  const resolvedConfig = resolveConfig(config);
  const identity = resolvedConfig.apiEmail;
  const secret = resolvedConfig.apiPassword;

  if (!identity || !secret) {
    throw new Error('请设置 NPM_API_EMAIL 和 NPM_API_PASSWORD，或提供 NPM_API_TOKEN');
  }

  const { apiBase } = resolvedConfig;
  if (hasCachedToken(apiBase, identity)) {
    return getCachedToken(apiBase, identity);
  }

  const response = await fetch(`${apiBase}/api/tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ identity, secret })
  });

  const result = await parseResponse(response);

  if (!response.ok) {
    const detail = typeof result === 'string'
      ? result.slice(0, 200)
      : result?.message || result?.error?.message || result?.error || JSON.stringify(result);
    throw new Error(`登录 NPM 失败 (${response.status}): ${detail}`);
  }

  if (!result?.token) {
    throw new Error('NPM 登录成功，但响应中未包含 token');
  }

  setCachedToken(apiBase, identity, result.token);
  return result.token;
}

async function getAuthorizationHeader(config = null) {
  const resolvedConfig = resolveConfig(config);
  if (resolvedConfig.apiToken) {
    return `Bearer ${resolvedConfig.apiToken}`;
  }

  const token = await requestAuthToken(resolvedConfig);
  return `Bearer ${token}`;
}

/**
 * 调用 NPM API
 * @param {string} endpoint - API 端点
 * @param {string} method - HTTP 方法
 * @param {object|null} data - 请求数据
 * @param {object} options - 额外选项
 * @returns {Promise<object>} 响应数据
 */
async function callApi(endpoint, method = 'GET', data = null, options = {}) {
  const { requireAuth = true, retryOnUnauthorized = true, config = null } = options;
  const resolvedConfig = resolveConfig(config);
  const { apiBase } = resolvedConfig;
  const headers = {
    'Content-Type': 'application/json'
  };

  if (requireAuth) {
    headers.Authorization = await getAuthorizationHeader(resolvedConfig);
  }

  const response = await fetch(`${apiBase}/api${endpoint}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined
  });

  if (response.status === 401 && retryOnUnauthorized && !resolvedConfig.apiToken) {
    resetCachedToken(apiBase, resolvedConfig.apiEmail);
    return callApi(endpoint, method, data, { requireAuth, retryOnUnauthorized: false, config: resolvedConfig });
  }

  const result = await parseResponse(response);

  if (!response.ok) {
    const detail = typeof result === 'string'
      ? result.slice(0, 200)
      : result?.message || result?.error?.message || result?.error || JSON.stringify(result);
    throw new Error(`API Error ${response.status} (${endpoint}): ${detail}`);
  }

  return result;
}

function getConfiguredAuthMode(config = null) {
  const resolvedConfig = resolveConfig(config);

  if (resolvedConfig.apiToken) {
    return 'token';
  }

  if (resolvedConfig.apiEmail && resolvedConfig.apiPassword) {
    return 'password';
  }

  return 'none';
}

/**
 * 测试连接
 * @returns {Promise<boolean>} 连接是否成功
 */
export async function testConnection(config = null) {
  try {
    await callApi('/nginx/proxy-hosts', 'GET', null, { config });
    console.log(`✅ Nginx Proxy Manager 连接成功（鉴权方式: ${getConfiguredAuthMode(config)}）`);
    return true;
  } catch (error) {
    console.error('❌ Nginx Proxy Manager 连接失败:', error.message);
    return false;
  }
}

/**
 * 获取所有代理主机
 * @returns {Promise<Array>} 代理主机列表
 */
export async function getProxyHosts(config = null) {
  return await callApi('/nginx/proxy-hosts', 'GET', null, { config });
}

/**
 * 获取代理主机详情
 * @param {number} id - 代理主机 ID
 * @returns {Promise<object>} 代理主机详情
 */
export async function getProxyHost(id, config = null) {
  return await callApi(`/nginx/proxy-hosts/${id}`, 'GET', null, { config });
}

function normalizeProxyHostPayload(options = {}) {
  return {
    domain_names: Array.isArray(options.domain_names) ? options.domain_names : [],
    forward_host: options.forward_host,
    forward_port: options.forward_port,
    forward_scheme: options.forward_scheme || 'http',
    access_list_id: Number.parseInt(`${options.access_list_id ?? 0}`, 10) || 0
  };
}

/**
 * 创建代理主机
 * @param {object} options - 代理主机选项
 * @returns {Promise<object>} 创建结果
 */
export async function createProxyHost(options, config = null) {
  return await callApi('/nginx/proxy-hosts', 'POST', normalizeProxyHostPayload(options), { config });
}

/**
 * 更新代理主机
 * @param {number} id - 代理主机 ID
 * @param {object} options - 更新选项
 * @returns {Promise<object>} 更新结果
 */
export async function updateProxyHost(id, options, config = null) {
  return await callApi(`/nginx/proxy-hosts/${id}`, 'PUT', normalizeProxyHostPayload(options), { config });
}

/**
 * 删除代理主机
 * @param {number} id - 代理主机 ID
 * @returns {Promise<void>} 删除结果
 */
export async function deleteProxyHost(id, config = null) {
  return await callApi(`/nginx/proxy-hosts/${id}`, 'DELETE', null, { config });
}

/**
 * 根据域名查找代理主机
 * @param {string} domain - 域名
 * @returns {Promise<object|null>} 查询结果
 */
export async function findProxyHostByDomain(domain, config = null) {
  const hosts = await getProxyHosts(config);
  return hosts.find((host) => host.domain_names && host.domain_names.includes(domain)) || null;
}

/**
 * 从 Lucky 代理配置创建 NPM 代理主机
 * @param {object} luckyProxy - Lucky 代理配置
 * @returns {Promise<object>} 创建结果
 */
export async function createFromLuckyProxy({ domain, target, remark }, config = null) {
  const url = new URL(target);
  const forward_host = url.hostname;
  const forward_port = parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80);
  const forward_scheme = url.protocol.replace(':', '');

  return await createProxyHost({
    domain_names: [domain],
    forward_host,
    forward_port,
    forward_scheme,
    ssl_enabled: forward_scheme === 'https',
    http2_support: forward_scheme === 'https',
    advanced_config: `
# ${remark}
# Created by Central Hub from Lucky proxy
    `.trim()
  }, config);
}

/**
 * 启用/禁用代理主机
 * @param {number} id - 代理主机 ID
 * @param {boolean} enabled - 是否启用
 * @returns {Promise<object>} 更新结果
 */
export async function setProxyHostEnabled(id, enabled, config = null) {
  return await updateProxyHost(id, { enabled }, config);
}

/**
 * 获取代理主机统计信息
 * @returns {Promise<object>} 统计信息
 */
export async function getProxyHostStats(config = null) {
  const hosts = await getProxyHosts(config);

  return {
    total: hosts.length,
    enabled: hosts.filter((host) => host.enabled).length,
    disabled: hosts.filter((host) => !host.enabled).length,
    withSSL: hosts.filter((host) => host.ssl_enabled).length,
    http2: hosts.filter((host) => host.http2_support_enabled).length
  };
}

export async function createAccessToken(config = null) {
  return await requestAuthToken(config);
}

export function getNpmAuthConfig(config = null) {
  const resolvedConfig = resolveConfig(config);
  return {
    apiBase: resolvedConfig.apiBase,
    mode: getConfiguredAuthMode(resolvedConfig),
    hasToken: Boolean(resolvedConfig.apiToken),
    hasIdentity: Boolean(resolvedConfig.apiEmail),
    hasSecret: Boolean(resolvedConfig.apiPassword)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];

  switch (command) {
    case 'test':
      await testConnection();
      break;

    case 'login':
      try {
        const token = await createAccessToken();
        console.log(`✅ 登录成功，Token 前缀: ${token.slice(0, 24)}...`);
      } catch (error) {
        console.error('❌ 登录失败:', error.message);
      }
      break;

    case 'list':
      try {
        const hosts = await getProxyHosts();
        console.log(`\n📋 Nginx Proxy Manager 代理主机列表（共 ${hosts.length} 个）:\n`);
        hosts.forEach((host, index) => {
          const status = host.enabled ? '✅' : '❌';
          const ssl = host.ssl_enabled ? '🔒' : '  ';
          const domains = host.domain_names.join(', ');
          const target = `${host.forward_scheme}://${host.forward_host}:${host.forward_port}`;

          console.log(`${index + 1}. ${status} ${ssl} ${domains}`);
          console.log(`   ID: ${host.id}`);
          console.log(`   目标: ${target}`);
          if (host.advanced_config) {
            console.log(`   备注: ${host.advanced_config.split('\n')[0]}`);
          }
          console.log('');
        });
      } catch (error) {
        console.error('获取代理主机列表失败:', error.message);
      }
      break;

    case 'stats':
      try {
        const stats = await getProxyHostStats();
        console.log(`\n📊 代理主机统计:\n`);
        console.log(`  总数: ${stats.total}`);
        console.log(`  启用: ${stats.enabled}`);
        console.log(`  禁用: ${stats.disabled}`);
        console.log(`  SSL: ${stats.withSSL}`);
        console.log(`  HTTP/2: ${stats.http2}`);
        console.log('');
      } catch (error) {
        console.error('获取统计信息失败:', error.message);
      }
      break;

    default:
      console.log(`
Nginx Proxy Manager API 管理工具

用法:
  node npm-api.mjs test                    # 测试连接
  node npm-api.mjs login                   # 登录并获取访问 Token
  node npm-api.mjs list                    # 获取所有代理主机
  node npm-api.mjs stats                   # 获取统计信息

环境变量:
  NPM_API_BASE=http://192.168.3.200:50001
  NPM_API_TOKEN=<可选的静态 Token>
  NPM_API_EMAIL=<登录邮箱>
  NPM_API_PASSWORD=<登录密码>
      `);
  }
}

export default {
  testConnection,
  getProxyHosts,
  getProxyHost,
  createProxyHost,
  updateProxyHost,
  deleteProxyHost,
  findProxyHostByDomain,
  createFromLuckyProxy,
  setProxyHostEnabled,
  getProxyHostStats,
  createAccessToken,
  getNpmAuthConfig
};
