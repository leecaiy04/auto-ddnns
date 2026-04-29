#!/usr/bin/env node
/**
 * 快速查询指定设备的 IPv6 地址
 * 用法: node scripts/query-device-ipv6.mjs <设备ID>
 * 示例: node scripts/query-device-ipv6.mjs 10
 */

import { Client } from 'ssh2';
import { loadEnvFileAsync } from '../shared/env-loader.mjs';

// 加载环境变量
await loadEnvFileAsync();

const ROUTER_HOST = process.env.ROUTER_HOST || '192.168.9.1';
const ROUTER_USERNAME = process.env.ROUTER_USERNAME || 'root';
const ROUTER_PASSWORD = process.env.ROUTER_PASSWORD;
const ROUTER_TYPE = process.env.ROUTER_TYPE || 'ikuai';

const deviceId = process.argv[2];
if (!deviceId) {
  console.error('❌ 请提供设备ID');
  console.error('用法: node scripts/query-device-ipv6.mjs <设备ID>');
  console.error('示例: node scripts/query-device-ipv6.mjs 10');
  process.exit(1);
}

if (!ROUTER_PASSWORD) {
  console.error('❌ 路由器密码未设置');
  console.error('请在 .env 文件中设置 ROUTER_PASSWORD');
  process.exit(1);
}

console.log(`🔍 正在查询设备 ${deviceId} 的 IPv6 地址...`);
console.log(`路由器: ${ROUTER_HOST} (${ROUTER_TYPE})`);
console.log('');

/**
 * 执行 SSH 命令
 */
function executeSSHCommand(command, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = '';
    let settled = false;

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.end();
      if (err) reject(err);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      finish(new Error(`SSH 命令执行超时 (${timeout}ms)`));
    }, timeout);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          finish(err);
          return;
        }

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          console.error('stderr:', data.toString());
        });

        stream.on('close', () => {
          finish(null, output);
        });
      });
    });

    conn.on('error', (err) => {
      finish(err);
    });

    conn.connect({
      host: ROUTER_HOST,
      port: 22,
      username: ROUTER_USERNAME,
      password: ROUTER_PASSWORD,
      readyTimeout: timeout
    });
  });
}

/**
 * 解析 iKuai 路由器的 ARP 和 IPv6 邻居表
 */
function parseIKuaiTables(arpOutput, ipv6Output) {
  const devices = new Map();
  const targetIpv4 = `192.168.9.${deviceId}`;

  // 解析 ARP 表
  const arpLines = arpOutput.split('\n');
  for (const line of arpLines) {
    const match = line.match(/(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f:]+)/i);
    if (match) {
      const [, ipv4, mac] = match;
      if (ipv4 === targetIpv4) {
        devices.set(mac.toLowerCase(), { ipv4, mac: mac.toLowerCase(), ipv6: null });
      }
    }
  }

  // 解析 IPv6 邻居表
  const ipv6Lines = ipv6Output.split('\n');
  for (const line of ipv6Lines) {
    const match = line.match(/([0-9a-f:]+)\s+.*\s+([0-9a-f:]+)/i);
    if (match) {
      const [, ipv6, mac] = match;
      const normalizedMac = mac.toLowerCase();
      if (devices.has(normalizedMac)) {
        devices.get(normalizedMac).ipv6 = ipv6;
      }
    }
  }

  return Array.from(devices.values());
}

/**
 * 主函数
 */
async function main() {
  try {
    // 查询 ARP 表
    console.log('📡 查询 ARP 表...');
    const arpOutput = await executeSSHCommand('ip neigh show');

    // 查询 IPv6 邻居表
    console.log('📡 查询 IPv6 邻居表...');
    const ipv6Output = await executeSSHCommand('ip -6 neigh show');

    // 解析结果
    const devices = parseIKuaiTables(arpOutput, ipv6Output);

    if (devices.length === 0) {
      console.log('');
      console.log(`❌ 未找到设备 192.168.9.${deviceId}`);
      console.log('');
      console.log('可能的原因:');
      console.log('1. 设备不在线');
      console.log('2. 设备 IP 地址不是 192.168.9.' + deviceId);
      console.log('3. 路由器 ARP 表中没有该设备');
      process.exit(1);
    }

    console.log('');
    console.log('✅ 查询成功！');
    console.log('');

    for (const device of devices) {
      console.log(`设备信息:`);
      console.log(`  IPv4: ${device.ipv4}`);
      console.log(`  MAC:  ${device.mac}`);
      console.log(`  IPv6: ${device.ipv6 || '未获取到 IPv6 地址'}`);

      if (device.ipv6) {
        console.log('');
        console.log(`🎉 设备 ${deviceId} 的 IPv6 地址是: ${device.ipv6}`);
      } else {
        console.log('');
        console.log(`⚠️  设备 ${deviceId} 没有 IPv6 地址`);
        console.log('可能的原因:');
        console.log('1. 设备不支持 IPv6');
        console.log('2. 路由器未启用 IPv6');
        console.log('3. 设备未获取到 IPv6 地址');
      }
    }

  } catch (error) {
    console.error('');
    console.error('❌ 查询失败:', error.message);
    console.error('');
    console.error('请检查:');
    console.error('1. 路由器地址是否正确 (ROUTER_HOST)');
    console.error('2. 路由器用户名是否正确 (ROUTER_USERNAME)');
    console.error('3. 路由器密码是否正确 (ROUTER_PASSWORD)');
    console.error('4. 路由器是否允许 SSH 连接');
    process.exit(1);
  }
}

main();
