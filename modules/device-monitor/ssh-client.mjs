#!/usr/bin/env node
/**
 * SSH 客户端
 * 用于连接路由器并执行命令，特别是获取 IPv6 邻居表
 * 已针对华为 K173 (WAP) 等具有交互式 CLI 的路由器进行优化
 */

import { Client } from 'ssh2';
import { getEnv } from '../../shared/env-loader.mjs';

const ROUTER_HOST = getEnv('ROUTER_HOST', '192.168.3.1');
const ROUTER_USERNAME = getEnv('ROUTER_USERNAME', 'root');
const ROUTER_PASSWORD = getEnv('ROUTER_PASSWORD', '');

/**
 * 标准化 MAC 地址格式
 * 将 xx-xx-xx-xx-xx-xx, xxxx-xxxx-xxxx 统一转换为 xx:xx:xx:xx:xx:xx
 */
function normalizeMAC(mac) {
  if (!mac) return null;
  // 去除空格和引号
  let cleaned = mac.trim().replace(/['"]/g, '');
  
  // 处理 xxxx-xxxx-xxxx 格式
  if (/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/i.test(cleaned)) {
    cleaned = cleaned.replace(/-/g, '');
  }
  
  // 处理连字符 xx-xx... 格式
  cleaned = cleaned.replace(/-/g, ':');
  
  // 补丁：处理某些设备中间没有分隔符的情况 (如 112233445566)
  if (/^[0-9a-f]{12}$/i.test(cleaned)) {
    const matched = cleaned.match(/.{2}/g);
    if (matched) cleaned = matched.join(':');
  }
  
  return cleaned.toLowerCase();
}

/**
 * SSH 连接并执行命令
 * @param {string} command - 要执行的命令
 * @param {object} options - 连接选项
 * @returns {Promise<string>} 命令输出
 */
export function executeSSHCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const {
      host = ROUTER_HOST,
      username = ROUTER_USERNAME,
      password = ROUTER_PASSWORD,
      timeout = 25000
    } = options;

    if (!password) {
      reject(new Error('SSH 密码未设置，请设置 ROUTER_PASSWORD 环境变量'));
      return;
    }

    const conn = new Client();
    let settled = false;
    let stdout = '';
    let state = 'CONNECTING'; 

    const finish = (err, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.end();
      if (err) reject(err);
      else resolve(result);
    };

    const timer = setTimeout(() => {
      finish(new Error(`SSH 命令执行超时 (${timeout}ms), 最后状态: ${state}`));
    }, timeout);

    conn.on('ready', () => {
      state = 'INIT_SHELL';
      // 为华为等路由器请求 PTY，否则可能不会出现提示符
      conn.shell({ term: 'vt100' }, (err, stream) => {
        if (err) {
          finish(err);
          return;
        }

        stream.on('data', (data) => {
          const chunk = data.toString();
          if (process.env.SSH_DEBUG) console.log(`[SSH_RECV][${state}]:`, JSON.stringify(chunk));
          stdout += chunk;

          // 处理交互逻辑 - 华为/中兴等设备可能出现的二次验证
          if (state === 'INIT_SHELL') {
            if (chunk.includes('Login:') || chunk.includes('User name:')) {
              state = 'SENT_USER';
              stream.write(`${username}\n`);
              return;
            }
          }

          if (state === 'SENT_USER' || state === 'INIT_SHELL') {
            if (chunk.includes('Password:')) {
              state = 'SENT_PASS';
              stream.write(`${password}\n`);
              return;
            }
          }
          
          if (chunk.includes('wrong') || chunk.includes('locked')) {
             finish(new Error(`路由器登录失败: ${chunk.trim()}`));
             return;
          }

          // 检测提示符以发送命令
          if (state === 'SENT_PASS' || state === 'INIT_SHELL') {
            if (chunk.includes('>') || chunk.includes('#') || chunk.includes('$') || chunk.includes(']')) {
              state = 'COMMAND_SENT';
              if (process.env.SSH_DEBUG) console.log(`[SSH_STATE] PROMPT DETECTED, SENDING: ${command}`);
              stdout = ''; 
              
              stream.write(`${command}\n`);
              
              if (command === 'ip -6 neigh') {
                setTimeout(() => stream.write('display ipv6 neighbor\n'), 1000);
              } else if (command === 'ip neigh' || command === 'arp -a') {
                setTimeout(() => stream.write('display arp\n'), 1000);
              }
              
              setTimeout(() => {
                stream.write('quit\n');
                stream.write('exit\n');
              }, 4000);
              
              setTimeout(() => {
                const lines = stdout.split(/\r?\n/);
                const filtered = lines.filter(line => {
                  const t = line.trim();
                  return t && 
                    !t.includes('Login:') && 
                    !t.includes('User name:') &&
                    !t.includes('Password:') &&
                    !t.includes(command) &&
                    !t.includes('display ipv6 neighbor') &&
                    !t.includes('display arp') &&
                    !t.endsWith('>') &&
                    !t.endsWith('#') &&
                    !t.endsWith('$') &&
                    !t.endsWith(']') &&
                    !t.includes('quit') &&
                    !t.includes('exit');
                });
                finish(null, filtered.join('\n').trim());
              }, 6000);
            }
          }
        });

        // 如果 1.5 秒内没反应，发个回车探测提示符
        setTimeout(() => {
          if (state === 'INIT_SHELL' && !stdout) {
            if (process.env.SSH_DEBUG) console.log('[SSH_DEBUG] No data received, sending newline...');
            stream.write('\n');
          }
        }, 1500);
      });
    });

    conn.on('error', (err) => {
      finish(new Error(`SSH 连接失败: ${err.message}`));
    });

    conn.connect({
      host,
      port: 22,
      username,
      password,
      readyTimeout: 10000,
      algorithms: {
        kex: ['curve25519-sha256', 'ecdh-sha2-nistp256', 'diffie-hellman-group14-sha256', 'diffie-hellman-group-exchange-sha256'],
        cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm', 'aes256-gcm'],
        serverHostKey: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ecdsa-sha2-nistp256']
      },
      tryKeyboard: true
    });
  });
}

/**
 * 测试 SSH 连接
 */
export async function testSSHConnection(options = {}) {
  try {
    const out = await executeSSHCommand('echo "ok"', options);
    console.log('✅ SSH 连接测试成功！');
    return out.includes('ok') || out.length > 0;
  } catch (error) {
    console.error('❌ SSH 连接测试失败:', error.message);
    return false;
  }
}

/**
 * 获取路由器的 IPv6 邻居表
 */
export async function getIPv6Neighbors(options = {}) {
  try {
    const output = await executeSSHCommand('ip -6 neigh', options);
    const neighbors = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const tokens = line.trim().split(/\s+/u);
      const ipv6 = tokens.find((token) => {
        if (!/^[0-9a-f:]+$/iu.test(token) || !token.includes(':')) {
          return false;
        }

        const normalized = token.toLowerCase();
        if (normalized.startsWith('fe80:')) {
          return false;
        }

        return normalized.includes('::') || normalized.split(':').length > 6;
      });
      const macMatch = line.match(/([0-9a-f]{2}[:][0-9a-f]{2}[:][0-9a-f]{2}[:][0-9a-f]{2}[:][0-9a-f]{2}[:][0-9a-f]{2}|[0-9a-f]{4}[-][0-9a-f]{4}[-][0-9a-f]{4}|[0-9a-f]{2}[-][0-9a-f]{2}[-][0-9a-f]{2}[-][0-9a-f]{2}[-][0-9a-f]{2}[-][0-9a-f]{2})/i);

      if (!ipv6 || !macMatch) continue;

      const mac = normalizeMAC(macMatch[1]);

      if (line.includes('FAILED')) continue;

      neighbors.push({
        ipv6,
        mac,
        interface: 'unknown',
        state: 'REACHABLE',
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
 * 获取路由器的 ARP 表
 */
export async function getARPTable(options = {}) {
  try {
    const output = await executeSSHCommand('ip neigh', options);
    const arpEntries = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const ipMatch = line.match(/(192\.168\.3\.\d+)/);
      const macMatch = line.match(/([0-9a-f]{2}[:][0-9a-f]{2}[:][0-9a-f]{2}[:][0-9a-f]{2}[:][0-9a-f]{2}[:][0-9a-f]{2}|[0-9a-f]{4}[-][0-9a-f]{4}[-][0-9a-f]{4}|[0-9a-f]{2}[-][0-9a-f]{2}[-][0-9a-f]{2}[-][0-9a-f]{2}[-][0-9a-f]{2}[-][0-9a-f]{2})/i);

      if (!ipMatch || !macMatch) continue;

      const mac = normalizeMAC(macMatch[1]);
      if (mac === '00:00:00:00:00:00') continue;

      arpEntries.push({
        ip: ipMatch[1],
        mac,
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
 * 构建设备地址映射表
 */
export async function buildDeviceAddressMap(options = {}) {
  try {
    const arpEntries = await getARPTable(options);
    const neighbors = await getIPv6Neighbors(options);

    const deviceMap = new Map();

    for (const arp of arpEntries) {
      deviceMap.set(arp.ip, {
        ipv4: arp.ip,
        mac: arp.mac,
        ipv6: null
      });
    }

    for (const neighbor of neighbors) {
      for (const [ipv4, device] of deviceMap.entries()) {
        if (device.mac === neighbor.mac) {
          device.ipv6 = neighbor.ipv6;
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

export default {
  executeSSHCommand,
  testSSHConnection,
  getIPv6Neighbors,
  getARPTable,
  buildDeviceAddressMap
};

// CLI 接口
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  switch (command) {
    case 'test':
      await testSSHConnection();
      break;
    case 'ipv6':
      const neighbors = await getIPv6Neighbors();
      console.log(JSON.stringify(neighbors, null, 2));
      break;
    case 'arp':
      const arp = await getARPTable();
      console.log(JSON.stringify(arp, null, 2));
      break;
    case 'map':
      const deviceMap = await buildDeviceAddressMap();
      console.log(Object.fromEntries(deviceMap));
      break;
    case 'exec':
      const out = await executeSSHCommand(process.argv[3]);
      console.log(out);
      break;
    default:
      console.log('Usage: node ssh-client.mjs [test|ipv6|arp|map|exec <command>]');
  }
}
