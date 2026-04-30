#!/usr/bin/env node
/**
 * Lucky SSL API 测试脚本
 * 测试证书列表获取、证书信息查看等功能
 */

import { getSSLList } from '../modules/lucky-manager/lucky-ssl.mjs';

const config = {
  apiBase: process.env.LUCKY_API_BASE || 'http://192.168.9.2:16601/666',
  openToken: process.env.LUCKY_OPEN_TOKEN || process.env.LUCKY_TOKEN
};

async function testSSLAPI() {
  console.log('=== Lucky SSL API 测试 ===\n');

  try {
    // 1. 获取证书列表
    console.log('1. 获取证书列表...');
    const result = await getSSLList(config);

    if (result.ret !== 0) {
      throw new Error(`API 返回错误: ${result.msg || '未知错误'}`);
    }

    const certs = result.list || [];
    console.log(`✅ 成功获取 ${certs.length} 个证书\n`);

    // 2. 显示证书详情
    for (const cert of certs) {
      console.log(`证书: ${cert.Remark}`);
      console.log(`  Key: ${cert.Key}`);
      console.log(`  启用: ${cert.Enable ? '是' : '否'}`);
      console.log(`  来源: ${cert.AddFrom}`);
      console.log(`  域名: ${cert.CertsInfo.Domains.join(', ')}`);
      console.log(`  生效时间: ${cert.CertsInfo.NotBeforeTime}`);
      console.log(`  过期时间: ${cert.CertsInfo.NotAfterTime}`);

      // 计算剩余天数
      const expiryDate = new Date(cert.CertsInfo.NotAfterTime);
      const now = new Date();
      const daysLeft = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
      console.log(`  剩余天数: ${daysLeft} 天`);

      if (cert.ExtParams?.acmeDNSServer) {
        console.log(`  DNS 提供商: ${cert.ExtParams.acmeDNSServer}`);
        console.log(`  ACME 邮箱: ${cert.ExtParams.acmeEmail}`);
      }

      if (cert.ACMEing) {
        console.log(`  ⚠️  正在申请/续期中...`);
      }

      if (cert.ACMEErrMsg) {
        console.log(`  ❌ ACME 错误: ${cert.ACMEErrMsg}`);
      }

      console.log('');
    }

    // 3. 检查即将过期的证书
    console.log('3. 检查即将过期的证书 (30天内)...');
    const expiringCerts = certs.filter(cert => {
      const expiryDate = new Date(cert.CertsInfo.NotAfterTime);
      const now = new Date();
      const daysLeft = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
      return daysLeft <= 30;
    });

    if (expiringCerts.length > 0) {
      console.log(`⚠️  发现 ${expiringCerts.length} 个即将过期的证书:`);
      for (const cert of expiringCerts) {
        const expiryDate = new Date(cert.CertsInfo.NotAfterTime);
        const now = new Date();
        const daysLeft = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
        console.log(`  - ${cert.Remark}: ${daysLeft} 天后过期`);
      }
    } else {
      console.log('✅ 所有证书都在有效期内');
    }

    console.log('\n=== 测试完成 ===');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

testSSLAPI();
