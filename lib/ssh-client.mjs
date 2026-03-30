#!/usr/bin/env node
/**
 * SSH 客户端
 * 用于连接路由器并执行命令，特别是获取 IPv6 邻居表
 */

import { Client } from 'ssh2';
import { getEnv } from './utils/env-loader.mjs';

const ROUTER_HOST = getEnv('ROUTER_HOST', '192.168.3.1');
const ROUTER_USERNAME = getEnv('ROUTER_USERNAME', 'root');
const ROUTER_PASSWORD = getEnv('ROUTER_PASSWORD', '');

/**
 * SSH 连接并执行命令
 * @param {string} command - 要执行的命令
 * @param {object} options - 连接选项
 * @param {string} options.host - 主机地址
 * @param {string} options.username - 用户名
 * @param {string} options.password - 密码
 * @param {number} options.timeout - 超时时间（毫秒）
 * @returns {Promise<string>} 命令输出
 */
export function executeSSHCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      host = ROUTER_HOST,
      username = ROUTER_USERNAME,
      password = ROUTER_PASSWORD,
      timeout = 10000
    } = options;

    if (!password) {
      reject(new Error('SSH 密码未设置，请设置 ROUTER_PASSWORD 环境变量'));
      return;
    }

    const conn = new Client();
    let output = '';
    let errorOutput = '';

    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH 命令执行超时 (${timeout}ms)`));
    }, timeout);

    conn.on('ready', () => {
      // 直接使用shell方法
      conn.shell((err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          reject(err);
          return;
        }

        // 发送命令
        stream.write(command + '\n');

        // 等待一小段时间后退出
        setTimeout(() => {
          stream.write('exit\n');
        }, 1000);

        stream.on('data', (data) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });

        stream.on('close', (code, signal) => {
          clearTimeout(timer);
          conn.end();

          // 清理输出：移除命令回显和提示符
          const lines = output.split('\n');
          const cleaned = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed &&
                   !trimmed.startsWith(command) &&
                   !trimmed.endsWith('#') &&
                   !trimmed.endsWith('$') &&
                   trimmed !== '';
          });

          resolve(cleaned.join('\n').trim());
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`SSH 连接失败: ${err.message}`));
    });

    conn.connect({
      host,
      port: 22,
      username,
      password,
      readyTimeout: timeout,
      algorithms: {
        kex: ['curve25519-sha256', 'ecdh-sha2-nistp256', 'diffie-hellman-group14-sha256'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm', 'aes256-gcm'],
        serverHostKey: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ecdsa-sha2-nistp256']
      },
      tryKeyboard: true,
      readyTimeout: timeout
    });
  });
}

/**
 * 测试 SSH 连接
 * @param {object} options - 连接选项
 * @returns {Promise<boolean>} 连接是否成功
 */
export async function testSSHConnection(options = {}) {
  try {
    await executeSSHCommand('echo "connection test"', options);
    console.log('✅ SSH 连接测试成功！');
    return true;
  } catch (error) {
    console.error('❌ SSH 连接测试失败:', error.message);
    return false;
  }
}

/**
 * 获取路由器的 IPv6 邻居表
 * @param {object} options - 连接选项
 * @returns {Promise<Array>} IPv6 邻居列表
 */
export async function getIPv6Neighbors(options = {}) {
  try {
    const output = await executeSSHCommand('ip -6 neigh show', options);

    // 解析 IPv6 邻居表
    const neighbors = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      // 解析格式: 240e:391:cd0:3d70::123 dev br-lan lladdr 11:22:33:44:55:66 REACHABLE
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;

      const ipv6 = parts[0];
      const iface = parts[2]; // dev 后面是接口名
      const mac = parts[4]; // lladdr 后面是 MAC 地址
      const state = parts[5]; // 状态: REACHABLE, STALE, FAILED 等

      // 过滤链路本地地址 (fe80::)
      if (ipv6.startsWith('fe80::')) continue;

      // 过滤失败的状态
      if (state === 'FAILED') continue;

      neighbors.push({
        ipv6,
        mac,
        interface: iface,
        state,
        timestamp: new Date().toISOString()
      });
    }

    return neighbors;
  } catch (error) {
    console.error('获取 IPv6 邻居表失败:', error.message);
    return [];
  }
}

/**
 * 获取设备的 IPv6 地址
 * @param {string} macAddress - MAC 地址
 * @param {object} options - 连接选项
 * @returns {Promise<string|null>} IPv6 地址或 null
 */
export async function getDeviceIPv6ByMAC(macAddress, options = {}) {
  try {
    const neighbors = await getIPv6Neighbors(options);

    // 查找匹配的 MAC 地址
    const neighbor = neighbors.find(n =>
      n.mac.toLowerCase() === macAddress.toLowerCase().replace(/-/g, ':')
    );

    return neighbor ? neighbor.ipv6 : null;
  } catch (error) {
    console.error(`根据 MAC 获取 IPv6 失败:`, error.message);
    return null;
  }
}

/**
 * 获取路由器的 ARP 表
 * @param {object} options - 连接选项
 * @returns {Promise<Array>} ARP 表条目
 */
export async function getARPTable(options = {}) {
  try {
    const output = await executeSSHCommand('cat /proc/net/arp', options);

    // 解析 ARP 表
    const arpEntries = [];
    const lines = output.split('\n');

    // 跳过标题行
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 解析格式: IP address       HW type     Flags       HW address            Mask     Device
      const parts = line.split(/\s+/);
      if (parts.length < 6) continue;

      const ip = parts[0];
      const mac = parts[3]; // HW address
      const device = parts[5]; // Device

      // 过滤无效的 MAC 地址
      if (mac === '00:00:00:00:00:00') continue;

      arpEntries.push({
        ip,
        mac,
        device,
        timestamp: new Date().toISOString()
      });
    }

    return arpEntries;
  } catch (error) {
    console.error('获取 ARP 表失败:', error.message);
    return [];
  }
}

/**
 * 获取设备的 IPv4 地址（通过 MAC 地址）
 * @param {string} macAddress - MAC 地址
 * @param {object} options - 连接选项
 * @returns {Promise<string|null>} IPv4 地址或 null
 */
export async function getDeviceIPv4ByMAC(macAddress, options = {}) {
  try {
    const arpEntries = await getARPTable(options);

    // 查找匹配的 MAC 地址
    const entry = arpEntries.find(e =>
      e.mac.toLowerCase() === macAddress.toLowerCase().replace(/-/g, ':')
    );

    return entry ? entry.ip : null;
  } catch (error) {
    console.error(`根据 MAC 获取 IPv4 失败:`, error.message);
    return null;
  }
}

/**
 * 构建设备地址映射表（IPv4 + IPv6）
 * @param {object} options - 连接选项
 * @returns {Promise<Map>} 设备地址映射 (IPv4 -> {ipv4, ipv6, mac})
 */
export async function buildDeviceAddressMap(options = {}) {
  try {
    const [arpEntries, neighbors] = await Promise.all([
      getARPTable(options),
      getIPv6Neighbors(options)
    ]);

    const deviceMap = new Map();

    // 先添加 ARP 表中的条目
    for (const arp of arpEntries) {
      deviceMap.set(arp.ip, {
        ipv4: arp.ip,
        mac: arp.mac,
        ipv6: null
      });
    }

    // 通过 MAC 地址关联 IPv6
    for (const neighbor of neighbors) {
      for (const [ipv4, device] of deviceMap.entries()) {
        if (device.mac.toLowerCase() === neighbor.mac.toLowerCase()) {
          device.ipv6 = neighbor.ipv6;
          device.ipv6State = neighbor.state;
          device.ipv6Interface = neighbor.interface;
          break;
        }
      }
    }

    return deviceMap;
  } catch (error) {
    console.error('构建设备地址映射失败:', error.message);
    return new Map();
  }
}

// CLI 接口
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  switch (command) {
    case 'test':
      await testSSHConnection();
      break;

    case 'ipv6':
      try {
        const neighbors = await getIPv6Neighbors();
        console.log(`\n📡 IPv6 邻居表 (共 ${neighbors.length} 个):\n`);
        neighbors.forEach((n, index) => {
          console.log(`${index + 1}. ${n.ipv6}`);
          console.log(`   MAC: ${n.mac}`);
          console.log(`   接口: ${n.interface}`);
          console.log(`   状态: ${n.state}`);
          console.log('');
        });
      } catch (error) {
        console.error('获取 IPv6 邻居表失败:', error.message);
      }
      break;

    case 'arp':
      try {
        const arpEntries = await getARPTable();
        console.log(`\n📡 ARP 表 (共 ${arpEntries.length} 个):\n`);
        arpEntries.forEach((entry, index) => {
          console.log(`${index + 1}. ${entry.ip}`);
          console.log(`   MAC: ${entry.mac}`);
          console.log(`   设备: ${entry.device}`);
          console.log('');
        });
      } catch (error) {
        console.error('获取 ARP 表失败:', error.message);
      }
      break;

    case 'map':
      try {
        const deviceMap = await buildDeviceAddressMap();
        console.log(`\n🗺️  设备地址映射表 (共 ${deviceMap.size} 个):\n`);

        let index = 1;
        for (const [ipv4, device] of deviceMap.entries()) {
          console.log(`${index}. ${ipv4}`);
          console.log(`   MAC: ${device.mac}`);
          if (device.ipv6) {
            console.log(`   IPv6: ${device.ipv6}`);
          } else {
            console.log(`   IPv6: 未找到`);
          }
          console.log('');
          index++;
        }
      } catch (error) {
        console.error('构建设备地址映射失败:', error.message);
      }
      break;

    case 'exec':
      const command = process.argv[3];
      if (!command) {
        console.error('用法: node ssh-client.mjs exec <command>');
        process.exit(1);
      }
      try {
        const output = await executeSSHCommand(command);
        console.log(output);
      } catch (error) {
        console.error('执行命令失败:', error.message);
      }
      break;

    default:
      console.log(`
SSH 客户端工具

用法:
  node ssh-client.mjs test                    # 测试 SSH 连接
  node ssh-client.mjs ipv6                    # 获取 IPv6 邻居表
  node ssh-client.mjs arp                     # 获取 ARP 表
  node ssh-client.mjs map                     # 获取设备地址映射表
  node ssh-client.mjs exec <command>         # 执行命令

示例:
  node ssh-client.mjs test
  node ssh-client.mjs ipv6
  node ssh-client.mjs exec "ip -6 neigh"
      `);
  }
}

export default {
  executeSSHCommand,
  testSSHConnection,
  getIPv6Neighbors,
  getDeviceIPv6ByMAC,
  getARPTable,
  getDeviceIPv4ByMAC,
  buildDeviceAddressMap
};
