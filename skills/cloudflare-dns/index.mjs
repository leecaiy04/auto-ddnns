/**
 * Cloudflare DNS Manager Skill
 * 提供 Cloudflare DNS 记录管理和 DDNS 更新功能
 */

import { listDnsRecords, createDnsRecord, updateDnsRecord, deleteDnsRecord } from '../../modules/cloudflare-manager/cloudflare-api.mjs';
import { getEnv } from '../../shared/env-loader.mjs';

const config = {
  apiToken: getEnv('CLOUDFLARE_API_TOKEN'),
  zoneId: getEnv('CLOUDFLARE_ZONE_ID'),
  domain: getEnv('ALIYUN_DOMAIN', 'leecaiy.shop')
};

/**
 * 列出所有 DNS 记录
 */
export async function listRecords(params = {}) {
  const { type, name } = params;
  return await listDnsRecords(config.zoneId, { type, name }, config);
}

/**
 * 创建 DNS 记录
 */
export async function createRecord(params) {
  const { type, name, content, ttl = 1, proxied = false } = params;
  return await createDnsRecord({ type, name, content, ttl, proxied }, config.zoneId, config);
}

/**
 * 更新 DNS 记录
 */
export async function updateRecord(params) {
  const { recordId, type, name, content, ttl = 1, proxied = false } = params;
  return await updateDnsRecord(recordId, { type, name, content, ttl, proxied }, config.zoneId, config);
}

/**
 * 删除 DNS 记录
 */
export async function deleteRecord(recordId) {
  return await deleteDnsRecord(recordId, config.zoneId, config);
}

/**
 * 更新 DDNS（自动创建或更新 A/AAAA 记录）
 */
export async function updateDDNS(params) {
  const { subdomain, ipv4, ipv6 } = params;
  const name = subdomain ? `${subdomain}.${config.domain}` : config.domain;
  const results = [];

  // 更新 IPv4 (A 记录)
  if (ipv4) {
    const existing = await listDnsRecords(config.zoneId, { type: 'A', name }, config);
    if (existing.length > 0) {
      const result = await updateDnsRecord(existing[0].id, {
        type: 'A',
        name,
        content: ipv4,
        ttl: 1,
        proxied: false
      }, config.zoneId, config);
      results.push({ type: 'A', action: 'updated', result });
    } else {
      const result = await createDnsRecord({
        type: 'A',
        name,
        content: ipv4,
        ttl: 1,
        proxied: false
      }, config.zoneId, config);
      results.push({ type: 'A', action: 'created', result });
    }
  }

  // 更新 IPv6 (AAAA 记录)
  if (ipv6) {
    const existing = await listDnsRecords(config.zoneId, { type: 'AAAA', name }, config);
    if (existing.length > 0) {
      const result = await updateDnsRecord(existing[0].id, {
        type: 'AAAA',
        name,
        content: ipv6,
        ttl: 1,
        proxied: false
      }, config.zoneId, config);
      results.push({ type: 'AAAA', action: 'updated', result });
    } else {
      const result = await createDnsRecord({
        type: 'AAAA',
        name,
        content: ipv6,
        ttl: 1,
        proxied: false
      }, config.zoneId, config);
      results.push({ type: 'AAAA', action: 'created', result });
    }
  }

  return results;
}

/**
 * 批量更新设备的 DDNS
 */
export async function batchUpdateDDNS(devices) {
  const results = [];

  for (const device of devices) {
    try {
      const result = await updateDDNS({
        subdomain: device.subdomain || device.id,
        ipv4: device.ipv4,
        ipv6: device.ipv6
      });
      results.push({
        device: device.id,
        status: 'success',
        result
      });
    } catch (error) {
      results.push({
        device: device.id,
        status: 'error',
        error: error.message
      });
    }
  }

  return results;
}

export default {
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  updateDDNS,
  batchUpdateDDNS
};
