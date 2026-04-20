#!/usr/bin/env node
/**
 * Lucky SSL 证书管理 API
 * 用于管理 SSL 证书的申请、续期和删除
 */

import { openTokenFetch } from './lucky-api.mjs';

/**
 * 获取所有 SSL 证书列表
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} SSL 证书列表
 */
export async function getSSLList(config = null) {
  return await openTokenFetch('/api/ssl', {}, config);
}

/**
 * 获取指定证书详情
 * @param {string} certKey - 证书 Key
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 证书详情
 */
export async function getSSLInfo(certKey, config = null) {
  const result = await getSSLList(config);
  if (result.ret !== 0) {
    throw new Error(`获取证书列表失败: ${result.msg || '未知错误'}`);
  }

  const cert = result.list?.find(c => c.Key === certKey);
  if (!cert) {
    throw new Error(`证书 ${certKey} 不存在`);
  }

  return cert;
}

/**
 * 申请新的 ACME 证书
 * @param {Object} options - 证书申请选项
 * @param {string} options.remark - 证书备注
 * @param {string[]} options.domains - 域名列表
 * @param {string} options.email - 邮箱地址
 * @param {string} options.dnsProvider - DNS 提供商 (alidns, cloudflare, etc.)
 * @param {string} options.dnsId - DNS API ID
 * @param {string} options.dnsSecret - DNS API Secret
 * @param {string} [options.caUrl] - CA 服务器 URL (默认: Let's Encrypt)
 * @param {string} [options.keyType] - 密钥类型 (默认: "2048")
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 申请结果
 */
export async function applyACMECert({
  remark,
  domains,
  email,
  dnsProvider,
  dnsId,
  dnsSecret,
  caUrl = 'https://acme-v02.api.letsencrypt.org/directory',
  keyType = '2048'
}, config = null) {
  const requestBody = {
    Remark: remark,
    Enable: true,
    AddFrom: 'acme',
    ExtParams: {
      acmeCADirURL: caUrl,
      acmeDNSServer: dnsProvider,
      acmeDNSID: dnsId,
      acmeDNSSecret: dnsSecret,
      acmeDomains: domains,
      acmeEmail: email,
      acmeKeyType: keyType,
      acmeCNAMESupport: true,
      acmeDNSForceIPv4: true,
      acmeOnlyUseIPv4: true,
      acmeIgnorePropagationChecErrors: true,
      acmePropagationTimeout: 600,
      acmeWaitforcertificateTimeout: 120
    }
  };

  return await openTokenFetch('/api/ssl/apply', {
    method: 'POST',
    body: requestBody
  }, config);
}

/**
 * 续期证书
 * @param {string} certKey - 证书 Key
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 续期结果
 */
export async function renewCert(certKey, config = null) {
  return await openTokenFetch('/api/ssl/renew', {
    method: 'POST',
    body: { Key: certKey }
  }, config);
}

/**
 * 删除证书
 * @param {string} certKey - 证书 Key
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteCert(certKey, config = null) {
  return await openTokenFetch('/api/ssl/delete', {
    method: 'POST',
    body: { Key: certKey }
  }, config);
}

/**
 * 检查证书是否即将过期
 * @param {string} certKey - 证书 Key
 * @param {number} daysThreshold - 天数阈值 (默认: 30天)
 * @param {Object} config - 配置对象
 * @returns {Promise<boolean>} 是否即将过期
 */
export async function isCertExpiringSoon(certKey, daysThreshold = 30, config = null) {
  const cert = await getSSLInfo(certKey, config);

  if (!cert.CertsInfo?.NotAfterTime) {
    throw new Error('证书信息不完整');
  }

  const expiryDate = new Date(cert.CertsInfo.NotAfterTime);
  const now = new Date();
  const daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));

  return daysUntilExpiry <= daysThreshold;
}

/**
 * 获取证书过期信息
 * @param {string} certKey - 证书 Key
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 过期信息
 */
export async function getCertExpiryInfo(certKey, config = null) {
  const cert = await getSSLInfo(certKey, config);

  if (!cert.CertsInfo?.NotAfterTime) {
    throw new Error('证书信息不完整');
  }

  const expiryDate = new Date(cert.CertsInfo.NotAfterTime);
  const now = new Date();
  const daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));

  return {
    certKey,
    remark: cert.Remark,
    domains: cert.CertsInfo.Domains,
    notAfter: cert.CertsInfo.NotAfterTime,
    daysUntilExpiry,
    isExpired: daysUntilExpiry < 0,
    isExpiringSoon: daysUntilExpiry <= 30
  };
}

/**
 * 列出所有即将过期的证书
 * @param {number} daysThreshold - 天数阈值 (默认: 30天)
 * @param {Object} config - 配置对象
 * @returns {Promise<Array>} 即将过期的证书列表
 */
export async function listExpiringSoonCerts(daysThreshold = 30, config = null) {
  const result = await getSSLList(config);

  if (result.ret !== 0) {
    throw new Error(`获取证书列表失败: ${result.msg || '未知错误'}`);
  }

  const expiringSoon = [];

  for (const cert of result.list || []) {
    if (!cert.CertsInfo?.NotAfterTime) continue;

    const expiryDate = new Date(cert.CertsInfo.NotAfterTime);
    const now = new Date();
    const daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry <= daysThreshold) {
      expiringSoon.push({
        certKey: cert.Key,
        remark: cert.Remark,
        domains: cert.CertsInfo.Domains,
        notAfter: cert.CertsInfo.NotAfterTime,
        daysUntilExpiry,
        isExpired: daysUntilExpiry < 0
      });
    }
  }

  return expiringSoon;
}

/**
 * 打印证书列表
 * @param {Object} config - 配置对象
 */
export async function printSSLList(config = null) {
  const result = await getSSLList(config);

  if (result.ret !== 0) {
    console.error(`获取证书列表失败: ${result.msg || '未知错误'}`);
    return;
  }

  console.log('\n=== Lucky SSL 证书列表 ===\n');

  if (!result.list || result.list.length === 0) {
    console.log('暂无证书');
    return;
  }

  for (const cert of result.list) {
    const status = cert.Enable ? '✅' : '❌';
    const domains = cert.CertsInfo?.Domains?.join(', ') || '无';
    const notAfter = cert.CertsInfo?.NotAfterTime || '未知';

    console.log(`${status} ${cert.Remark}`);
    console.log(`   Key: ${cert.Key}`);
    console.log(`   域名: ${domains}`);
    console.log(`   过期时间: ${notAfter}`);
    console.log(`   来源: ${cert.AddFrom}`);

    if (cert.CertsInfo?.NotAfterTime) {
      const expiryDate = new Date(cert.CertsInfo.NotAfterTime);
      const now = new Date();
      const daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry < 0) {
        console.log(`   ⚠️  已过期 ${Math.abs(daysUntilExpiry)} 天`);
      } else if (daysUntilExpiry <= 30) {
        console.log(`   ⚠️  还有 ${daysUntilExpiry} 天过期`);
      } else {
        console.log(`   ✓ 还有 ${daysUntilExpiry} 天过期`);
      }
    }

    console.log('');
  }
}

// CLI 接口
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  switch (command) {
    case 'list':
      await printSSLList();
      break;

    case 'expiring':
      const threshold = parseInt(process.argv[3]) || 30;
      const expiring = await listExpiringSoonCerts(threshold);
      console.log(`\n即将过期的证书 (${threshold}天内):\n`);
      if (expiring.length === 0) {
        console.log('无即将过期的证书');
      } else {
        expiring.forEach(cert => {
          console.log(`- ${cert.remark} (${cert.domains.join(', ')})`);
          console.log(`  过期时间: ${cert.notAfter} (还有 ${cert.daysUntilExpiry} 天)`);
        });
      }
      break;

    default:
      console.log(`
Lucky SSL 证书管理工具

用法:
  node lucky-ssl.mjs list              # 列出所有证书
  node lucky-ssl.mjs expiring [days]   # 列出即将过期的证书 (默认30天)

示例:
  node lucky-ssl.mjs list
  node lucky-ssl.mjs expiring 15
      `);
  }
}
