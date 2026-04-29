#!/usr/bin/env node
/**
 * 通过 iKuai Web API 查询指定设备的 IPv6 地址
 * 用法: node scripts/query-ikuai-ipv6.mjs <设备ID>
 * 示例: node scripts/query-ikuai-ipv6.mjs 10
 */

import https from 'https';
import axios from 'axios';
import { loadEnvFileAsync } from '../shared/env-loader.mjs';

// 加载环境变量
await loadEnvFileAsync();

const ROUTER_HOST = process.env.ROUTER_HOST || '192.168.9.1';
const ROUTER_USERNAME = process.env.ROUTER_USERNAME || 'admin';
const ROUTER_PASSWORD = process.env.ROUTER_PASSWORD;
const ROUTER_SSL_VERIFY = process.env.ROUTER_SSL_VERIFY !== '0';

const deviceId = process.argv[2];
if (!deviceId) {
  console.error('❌ 请提供设备ID');
  console.error('用法: node scripts/query-ikuai-ipv6.mjs <设备ID>');
  console.error('示例: node scripts/query-ikuai-ipv6.mjs 10');
  process.exit(1);
}

if (!ROUTER_PASSWORD) {
  console.error('❌ 路由器密码未设置');
  console.error('请在 .env 文件中设置 ROUTER_PASSWORD');
  process.exit(1);
}

console.log(`🔍 正在查询设备 ${deviceId} 的 IPv6 地址...`);
console.log(`路由器: ${ROUTER_HOST} (iKuai Web API)`);
console.log('');

// 创建 axios 实例
const api = axios.create({
  baseURL: `http://${ROUTER_HOST}`,
  timeout: 10000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: ROUTER_SSL_VERIFY
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
      console.log('✅ 登录成功');
      return response.headers['set-cookie'];
    } else {
      throw new Error(`登录失败: ${response.data?.ErrMsg || '未知错误'}`);
    }
  } catch (error) {
    throw new Error(`登录失败: ${error.message}`);
  }
}

/**
 * 查询 ARP 表
 */
async function getArpTable(cookies) {
  try {
    const response = await api.post('/Action/call', {
      func_name: 'monitor_lanip',
      action: 'show',
      param: {
        TYPE: 'arp_list,total',
        limit: '0,5000',
        ORDER_BY: '',
        ORDER: ''
      }
    }, {
      headers: {
        Cookie: cookies.join('; ')
      }
    });

    if (response.data?.Result === 30000) {
      return response.data.Data?.data || [];
    } else {
      throw new Error(`查询 ARP 表失败: ${response.data?.ErrMsg || '未知错误'}`);
    }
  } catch (error) {
    throw new Error(`查询 ARP 表失败: ${error.message}`);
  }
}

/**
 * 查询 IPv6 邻居表
 */
async function getIpv6Neighbors(cookies) {
  try {
    const response = await api.post('/Action/call', {
      func_name: 'ipv6',
      action: 'show',
      param: {
        TYPE: 'neighbor_data,total'
      }
    }, {
      headers: {
        Cookie: cookies.join('; ')
      }
    });

    if (response.data?.Result === 30000) {
      return response.data.Data?.data || [];
    } else {
      // IPv6 可能未启用，返回空数组
      return [];
    }
  } catch (error) {
    console.warn('⚠️  查询 IPv6 邻居表失败，可能路由器未启用 IPv6');
    return [];
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    // 登录
    console.log('🔐 正在登录路由器...');
    const cookies = await login();
    console.log('');

    // 查询 ARP 表
    console.log('📡 查询 ARP 表...');
    const arpTable = await getArpTable(cookies);
    console.log(`   找到 ${arpTable.length} 个设备`);

    // 查询 IPv6 邻居表
    console.log('📡 查询 IPv6 邻居表...');
    const ipv6Neighbors = await getIpv6Neighbors(cookies);
    console.log(`   找到 ${ipv6Neighbors.length} 个 IPv6 邻居`);
    console.log('');

    // 查找目标设备
    const targetIp = `192.168.9.${deviceId}`;
    const device = arpTable.find(d => d.ip_addr === targetIp);

    if (!device) {
      console.log(`❌ 未找到设备 ${targetIp}`);
      console.log('');
      console.log('可能的原因:');
      console.log('1. 设备不在线');
      console.log('2. 设备 IP 地址不是 192.168.9.' + deviceId);
      console.log('3. 路由器 ARP 表中没有该设备');
      console.log('');
      console.log('当前在线设备列表:');
      arpTable.slice(0, 10).forEach(d => {
        console.log(`  - ${d.ip_addr} (${d.mac})`);
      });
      if (arpTable.length > 10) {
        console.log(`  ... 还有 ${arpTable.length - 10} 个设备`);
      }
      process.exit(1);
    }

    // 查找对应的 IPv6 地址
    const mac = device.mac.toLowerCase();
    const ipv6Entry = ipv6Neighbors.find(n => n.mac?.toLowerCase() === mac);

    console.log('✅ 查询成功！');
    console.log('');
    console.log(`设备信息:`);
    console.log(`  IPv4:     ${device.ip_addr}`);
    console.log(`  MAC:      ${device.mac}`);
    console.log(`  主机名:   ${device.hostname || '未知'}`);
    console.log(`  接口:     ${device.interface || '未知'}`);

    if (ipv6Entry && ipv6Entry.ipv6_addr) {
      console.log(`  IPv6:     ${ipv6Entry.ipv6_addr}`);
      console.log('');
      console.log(`🎉 设备 ${deviceId} 的 IPv6 地址是: ${ipv6Entry.ipv6_addr}`);
    } else {
      console.log(`  IPv6:     未获取到 IPv6 地址`);
      console.log('');
      console.log(`⚠️  设备 ${deviceId} 没有 IPv6 地址`);
      console.log('');
      console.log('可能的原因:');
      console.log('1. 设备不支持 IPv6');
      console.log('2. 路由器未启用 IPv6');
      console.log('3. 设备未获取到 IPv6 地址');
    }

  } catch (error) {
    console.error('');
    console.error('❌ 查询失败:', error.message);
    console.error('');
    console.error('请检查:');
    console.error('1. 路由器地址是否正确 (ROUTER_HOST)');
    console.error('2. 路由器用户名是否正确 (ROUTER_USERNAME)');
    console.error('3. 路由器密码是否正确 (ROUTER_PASSWORD)');
    console.error('4. 路由器是否为 iKuai 系统');
    process.exit(1);
  }
}

main();
