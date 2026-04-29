#!/usr/bin/env node
/**
 * 通过 iKuai 路由器 API 获取设备的全局 IPv6 地址
 * 用法: node scripts/get-global-ipv6.mjs <设备IP>
 * 示例: node scripts/get-global-ipv6.mjs 192.168.9.10
 */

import https from 'https';
import axios from 'axios';
import { loadEnvFileAsync } from '../shared/env-loader.mjs';

// 加载环境变量
await loadEnvFileAsync();

const ROUTER_HOST = process.env.ROUTER_HOST || '192.168.9.1';
const ROUTER_USERNAME = process.env.ROUTER_USERNAME || 'admin';
const ROUTER_PASSWORD = process.env.ROUTER_PASSWORD;

const deviceIp = process.argv[2];

if (!ROUTER_PASSWORD) {
  console.error('❌ 路由器密码未设置');
  console.error('请在 .env 文件中设置 ROUTER_PASSWORD');
  process.exit(1);
}

// 创建 axios 实例
const api = axios.create({
  baseURL: `http://${ROUTER_HOST}`,
  timeout: 10000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
});

/**
 * iKuai 登录
 */
async function login() {
  try {
    const response = await api.post('/Action/login', {
      username: ROUTER_USERNAME,
      passwd: ROUTER_PASSWORD,
      pass: Buffer.from(ROUTER_PASSWORD).toString('base64')
    });

    if (response.data?.Result === 10000) {
      return response.headers['set-cookie'];
    } else {
      throw new Error(`登录失败: ${response.data?.ErrMsg || '未知错误'}`);
    }
  } catch (error) {
    throw new Error(`登录失败: ${error.message}`);
  }
}

/**
 * 查询 IPv6 设备列表
 */
async function getIpv6Devices(cookies) {
  try {
    const response = await api.post('/Action/ipv6_lanip', {
      action: 'show',
      TYPE: 'data',
      limit: '0,1000'
    }, {
      headers: {
        Cookie: cookies.join('; ')
      }
    });

    if (response.data?.Result === 30000) {
      return response.data.Data?.data || [];
    } else {
      throw new Error(`查询失败: ${response.data?.ErrMsg || '未知错误'}`);
    }
  } catch (error) {
    throw new Error(`查询 IPv6 设备列表失败: ${error.message}`);
  }
}

/**
 * 过滤全局 IPv6 地址（排除链路本地地址）
 */
function filterGlobalIpv6(ipv6Addresses) {
  if (!Array.isArray(ipv6Addresses)) return [];

  return ipv6Addresses.filter(addr => {
    const ip = addr.ip_addr || addr;
    return ip && !ip.startsWith('fe80:');
  });
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🔐 正在登录 iKuai 路由器...');
    const cookies = await login();
    console.log('✅ 登录成功');
    console.log('');

    console.log('📡 正在查询 IPv6 设备列表...');
    const devices = await getIpv6Devices(cookies);
    console.log(`✅ 找到 ${devices.length} 个设备`);
    console.log('');

    if (deviceIp) {
      // 查询指定设备
      const device = devices.find(d => d.ip_addr === deviceIp);

      if (!device) {
        console.log(`❌ 未找到设备 ${deviceIp}`);
        process.exit(1);
      }

      const globalIpv6 = filterGlobalIpv6(device.ipv6_addr || []);

      console.log(`设备信息: ${deviceIp}`);
      console.log(`  MAC: ${device.mac}`);
      console.log(`  主机名: ${device.hostname || '未知'}`);
      console.log('');

      if (globalIpv6.length > 0) {
        console.log(`✅ 全局 IPv6 地址 (${globalIpv6.length} 个):`);
        globalIpv6.forEach((addr, index) => {
          console.log(`  ${index + 1}. ${addr.ip_addr || addr}`);
        });
        console.log('');
        console.log(`🎉 主要 IPv6 地址: ${globalIpv6[0].ip_addr || globalIpv6[0]}`);
      } else {
        console.log('⚠️  该设备没有全局 IPv6 地址');
        console.log('');
        if (device.ipv6_addr && device.ipv6_addr.length > 0) {
          console.log('仅有链路本地地址:');
          device.ipv6_addr.forEach(addr => {
            console.log(`  - ${addr.ip_addr || addr}`);
          });
        }
      }
    } else {
      // 显示所有设备
      console.log('📊 所有设备的 IPv6 状态:');
      console.log('');

      let hasGlobalCount = 0;
      for (const device of devices) {
        const globalIpv6 = filterGlobalIpv6(device.ipv6_addr || []);
        const status = globalIpv6.length > 0 ? '✅' : '⚠️';

        console.log(`${status} ${device.ip_addr.padEnd(15)} ${device.mac.padEnd(17)} ${device.hostname || '未知'}`);

        if (globalIpv6.length > 0) {
          hasGlobalCount++;
          globalIpv6.forEach(addr => {
            console.log(`   └─ ${addr.ip_addr || addr}`);
          });
        } else if (device.ipv6_addr && device.ipv6_addr.length > 0) {
          console.log(`   └─ 仅链路本地: ${device.ipv6_addr[0].ip_addr || device.ipv6_addr[0]}`);
        }
        console.log('');
      }

      console.log('='.repeat(60));
      console.log(`📈 统计: ${hasGlobalCount}/${devices.length} 个设备有全局 IPv6 地址`);
    }

  } catch (error) {
    console.error('');
    console.error('❌ 查询失败:', error.message);
    console.error('');
    console.error('请检查:');
    console.error('1. 路由器地址是否正确 (ROUTER_HOST)');
    console.error('2. 路由器用户名是否正确 (ROUTER_USERNAME)');
    console.error('3. 路由器密码是否正确 (ROUTER_PASSWORD)');
    process.exit(1);
  }
}

main();
