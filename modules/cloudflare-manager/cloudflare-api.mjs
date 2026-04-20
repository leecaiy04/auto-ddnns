#!/usr/bin/env node
/**
 * Cloudflare DNS API 客户端
 * 通过 Cloudflare API v4 管理 DNS 记录
 */

import { getEnv } from '../../shared/env-loader.mjs';
import { pathToFileURL } from 'node:url';

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

// ==================== 配置解析 ====================

function resolveConfig(config = null) {
  const overrides = config ?? {};

  return {
    apiToken: overrides.apiToken ?? getEnv('CF_API_TOKEN', ''),
    zoneId: overrides.zoneId ?? getEnv('CF_ZONE_ID', ''),
    domain: overrides.domain ?? getEnv('CF_DOMAIN', '')
  };
}

/**
 * 获取 Cloudflare 认证配置信息
 * @param {object} config - 可选的实例配置
 * @returns {object} 认证配置
 */
export function getCfAuthConfig(config = null) {
  const resolved = resolveConfig(config);
  return {
    hasToken: Boolean(resolved.apiToken),
    hasZoneId: Boolean(resolved.zoneId),
    hasDomain: Boolean(resolved.domain),
    domain: resolved.domain,
    ready: Boolean(resolved.apiToken && resolved.zoneId)
  };
}

// ==================== HTTP 请求 ====================

async function cfFetch(endpoint, method = 'GET', data = null, config = null) {
  const resolved = resolveConfig(config);

  if (!resolved.apiToken) {
    throw new Error('CF_API_TOKEN 未设置。请在 .env 中配置 Cloudflare API Token');
  }

  const headers = {
    'Authorization': `Bearer ${resolved.apiToken}`,
    'Content-Type': 'application/json'
  };

  const url = `${CF_API_BASE}${endpoint}`;
  const options = { method, headers };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);
  const result = await response.json();

  if (!response.ok || !result.success) {
    const errors = result.errors?.map(e => `${e.code}: ${e.message}`).join('; ') || `HTTP ${response.status}`;
    throw new Error(`Cloudflare API Error (${method} ${endpoint}): ${errors}`);
  }

  return result;
}

// ==================== Token 验证 ====================

/**
 * 验证 API Token 是否有效
 * @param {object} config - 可选的实例配置
 * @returns {Promise<object>} 验证结果
 */
export async function verifyToken(config = null) {
  const result = await cfFetch('/user/tokens/verify', 'GET', null, config);
  return {
    valid: result.result?.status === 'active',
    status: result.result?.status,
    expiresOn: result.result?.expires_on
  };
}

// ==================== DNS 记录操作 ====================

/**
 * 列出指定 Zone 的所有 DNS 记录
 * @param {string} zoneId - Zone ID
 * @param {object} params - 查询参数
 * @param {object} config - 可选的实例配置
 * @returns {Promise<Array>} DNS 记录列表
 */
export async function listDnsRecords(zoneId = null, params = {}, config = null) {
  const resolved = resolveConfig(config);
  const zone = zoneId || resolved.zoneId;

  if (!zone) {
    throw new Error('CF_ZONE_ID 未设置。请在 .env 中配置或传入 zoneId');
  }

  // 构建查询参数
  const queryParts = [];
  if (params.type) queryParts.push(`type=${encodeURIComponent(params.type)}`);
  if (params.name) queryParts.push(`name=${encodeURIComponent(params.name)}`);
  if (params.per_page) queryParts.push(`per_page=${params.per_page}`);
  queryParts.push(`per_page=${params.per_page || 100}`);

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const result = await cfFetch(`/zones/${zone}/dns_records${queryString}`, 'GET', null, config);
  return result.result || [];
}

/**
 * 根据名称和类型查找 DNS 记录
 * @param {string} name - 完整域名（如 nas200.leecaiy.xyz）
 * @param {string} type - 记录类型（A / AAAA / CNAME 等）
 * @param {string} zoneId - Zone ID
 * @param {object} config - 可选的实例配置
 * @returns {Promise<object|null>} 找到的记录或 null
 */
export async function findDnsRecord(name, type = 'A', zoneId = null, config = null) {
  const records = await listDnsRecords(zoneId, { name, type }, config);
  return records.find(r => r.name === name && r.type === type) || null;
}

/**
 * 创建 DNS 记录
 * @param {object} record - DNS 记录 { type, name, content, proxied, ttl }
 * @param {string} zoneId - Zone ID
 * @param {object} config - 可选的实例配置
 * @returns {Promise<object>} 创建结果
 */
export async function createDnsRecord(record, zoneId = null, config = null) {
  const resolved = resolveConfig(config);
  const zone = zoneId || resolved.zoneId;

  if (!zone) {
    throw new Error('CF_ZONE_ID 未设置');
  }

  const payload = {
    type: record.type || 'A',
    name: record.name,
    content: record.content,
    proxied: record.proxied !== undefined ? record.proxied : true,
    ttl: record.proxied ? 1 : (record.ttl || 300),
    comment: record.comment || 'Created by auto-dnns Central Hub'
  };

  const result = await cfFetch(`/zones/${zone}/dns_records`, 'POST', payload, config);
  return result.result;
}

/**
 * 更新 DNS 记录
 * @param {string} recordId - 记录 ID
 * @param {object} record - 更新的记录数据
 * @param {string} zoneId - Zone ID
 * @param {object} config - 可选的实例配置
 * @returns {Promise<object>} 更新结果
 */
export async function updateDnsRecord(recordId, record, zoneId = null, config = null) {
  const resolved = resolveConfig(config);
  const zone = zoneId || resolved.zoneId;

  if (!zone) {
    throw new Error('CF_ZONE_ID 未设置');
  }

  const payload = {
    type: record.type || 'A',
    name: record.name,
    content: record.content,
    proxied: record.proxied !== undefined ? record.proxied : true,
    ttl: record.proxied ? 1 : (record.ttl || 300),
    comment: record.comment || 'Updated by auto-dnns Central Hub'
  };

  const result = await cfFetch(`/zones/${zone}/dns_records/${recordId}`, 'PUT', payload, config);
  return result.result;
}

/**
 * 删除 DNS 记录
 * @param {string} recordId - 记录 ID
 * @param {string} zoneId - Zone ID
 * @param {object} config - 可选的实例配置
 * @returns {Promise<object>} 删除结果
 */
export async function deleteDnsRecord(recordId, zoneId = null, config = null) {
  const resolved = resolveConfig(config);
  const zone = zoneId || resolved.zoneId;

  if (!zone) {
    throw new Error('CF_ZONE_ID 未设置');
  }

  const result = await cfFetch(`/zones/${zone}/dns_records/${recordId}`, 'DELETE', null, config);
  return result.result;
}

/**
 * 创建或更新 DNS 记录（核心方法）
 * @param {object} record - DNS 记录 { type, name, content, proxied, ttl }
 * @param {string} zoneId - Zone ID
 * @param {object} config - 可选的实例配置
 * @returns {Promise<{action: string, record: object}>} 操作结果
 */
export async function upsertDnsRecord(record, zoneId = null, config = null) {
  const existing = await findDnsRecord(record.name, record.type || 'A', zoneId, config);

  if (existing) {
    // 检查是否需要更新（IP 或 proxied 状态变化）
    const needsUpdate =
      existing.content !== record.content ||
      existing.proxied !== (record.proxied !== undefined ? record.proxied : true);

    if (!needsUpdate) {
      return { action: 'unchanged', record: existing };
    }

    const updated = await updateDnsRecord(existing.id, record, zoneId, config);
    return { action: 'updated', record: updated };
  }

  const created = await createDnsRecord(record, zoneId, config);
  return { action: 'created', record: created };
}

/**
 * 根据域名删除 DNS 记录
 * @param {string} name - 完整域名
 * @param {string} type - 记录类型
 * @param {string} zoneId - Zone ID
 * @param {object} config - 可选的实例配置
 * @returns {Promise<{action: string}>} 操作结果
 */
export async function deleteDnsRecordByName(name, type = 'A', zoneId = null, config = null) {
  const existing = await findDnsRecord(name, type, zoneId, config);

  if (!existing) {
    return { action: 'not_found' };
  }

  await deleteDnsRecord(existing.id, zoneId, config);
  return { action: 'deleted', recordId: existing.id };
}

/**
 * 获取 Zone 信息列表
 * @param {object} config - 可选的实例配置
 * @returns {Promise<Array>} Zone 列表
 */
export async function listZones(config = null) {
  const result = await cfFetch('/zones', 'GET', null, config);
  return (result.result || []).map(z => ({
    id: z.id,
    name: z.name,
    status: z.status,
    nameServers: z.name_servers
  }));
}

// ==================== CLI ====================

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];

  switch (command) {
    case 'verify':
      try {
        const result = await verifyToken();
        console.log(result.valid ? '✅ Token 有效' : '❌ Token 无效');
        console.log(`  状态: ${result.status}`);
        if (result.expiresOn) {
          console.log(`  过期时间: ${result.expiresOn}`);
        }
      } catch (error) {
        console.error('❌ Token 验证失败:', error.message);
      }
      break;

    case 'zones':
      try {
        const zones = await listZones();
        console.log(`\n📋 Cloudflare Zones（共 ${zones.length} 个）:\n`);
        zones.forEach((zone, i) => {
          console.log(`${i + 1}. ${zone.name} (${zone.status})`);
          console.log(`   ID: ${zone.id}`);
          console.log(`   NS: ${zone.nameServers.join(', ')}`);
          console.log('');
        });
      } catch (error) {
        console.error('❌ 获取 Zone 列表失败:', error.message);
      }
      break;

    case 'list':
      try {
        const records = await listDnsRecords();
        console.log(`\n📋 DNS 记录列表（共 ${records.length} 个）:\n`);
        records.forEach((record, i) => {
          const proxied = record.proxied ? '🟠' : '⚪';
          console.log(`${i + 1}. ${proxied} ${record.type} ${record.name} → ${record.content}`);
          if (record.comment) {
            console.log(`   备注: ${record.comment}`);
          }
        });
        console.log('');
      } catch (error) {
        console.error('❌ 获取 DNS 记录失败:', error.message);
      }
      break;

    default:
      console.log(`
Cloudflare DNS API 管理工具

用法:
  node cloudflare-api.mjs verify           # 验证 API Token
  node cloudflare-api.mjs zones            # 列出所有 Zone
  node cloudflare-api.mjs list             # 列出 DNS 记录

环境变量:
  CF_API_TOKEN=<Cloudflare API Token>
  CF_ZONE_ID=<Zone ID>
  CF_DOMAIN=<域名>
      `);
  }
}

export default {
  verifyToken,
  listDnsRecords,
  findDnsRecord,
  createDnsRecord,
  updateDnsRecord,
  deleteDnsRecord,
  upsertDnsRecord,
  deleteDnsRecordByName,
  listZones,
  getCfAuthConfig
};
