#!/usr/bin/env node
/**
 * 网络 IPv6 状态检查工具
 * 检查网络中所有设备的 IPv6 状态
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🔍 网络 IPv6 状态检查');
console.log('='.repeat(60));
console.log('');

async function main() {
  try {
    // 1. 检查本机 IPv6
    console.log('📡 本机 IPv6 状态:');
    const { stdout: ipv6Addrs } = await execAsync('ip -6 addr show | grep "inet6" | grep -v "::1" | grep -v "fe80"');
    if (ipv6Addrs.trim()) {
      console.log('   ✅ 本机已启用 IPv6');
      const addrs = ipv6Addrs.trim().split('\n');
      addrs.forEach(addr => {
        const match = addr.match(/inet6\s+([0-9a-f:]+)/i);
        if (match) {
          console.log(`      ${match[1]}`);
        }
      });
    } else {
      console.log('   ❌ 本机未启用 IPv6');
    }
    console.log('');

    // 2. 检查 IPv4 设备
    console.log('📡 局域网设备 (192.168.9.x):');
    const { stdout: arpTable } = await execAsync('ip neigh show | grep "192.168.9"');
    const devices = [];

    for (const line of arpTable.split('\n')) {
      const match = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+.*lladdr\s+([0-9a-f:]+)\s+(\w+)/i);
      if (match) {
        const [, ip, mac, state] = match;
        devices.push({ ip, mac: mac.toLowerCase(), state });
      }
    }

    console.log(`   找到 ${devices.length} 个设备`);
    console.log('');

    // 3. 检查每个设备的 IPv6
    console.log('📊 设备 IPv6 状态:');
    console.log('');

    const { stdout: ipv6Neigh } = await execAsync('ip -6 neigh show');
    const ipv6Map = new Map();

    for (const line of ipv6Neigh.split('\n')) {
      const match = line.match(/^([0-9a-f:]+)\s+.*lladdr\s+([0-9a-f:]+)/i);
      if (match) {
        const [, ipv6, mac] = match;
        if (!ipv6.startsWith('fe80:')) {  // 排除链路本地地址
          ipv6Map.set(mac.toLowerCase(), ipv6);
        }
      }
    }

    let hasIpv6Count = 0;
    for (const device of devices) {
      const ipv6 = ipv6Map.get(device.mac);
      const status = ipv6 ? '✅' : '❌';
      const ipv6Display = ipv6 || '无 IPv6';

      console.log(`${status} ${device.ip.padEnd(15)} ${device.mac.padEnd(17)} ${ipv6Display}`);

      if (ipv6) hasIpv6Count++;
    }

    console.log('');
    console.log('='.repeat(60));
    console.log(`📈 统计: ${hasIpv6Count}/${devices.length} 个设备支持 IPv6`);
    console.log('');

    // 4. 针对 192.168.9.10 的建议
    const target = devices.find(d => d.ip === '192.168.9.10');
    if (target) {
      console.log('💡 关于设备 192.168.9.10:');
      console.log('');
      console.log(`   IPv4: ${target.ip}`);
      console.log(`   MAC:  ${target.mac}`);
      console.log(`   状态: ${target.state}`);

      const ipv6 = ipv6Map.get(target.mac);
      if (ipv6) {
        console.log(`   IPv6: ${ipv6}`);
        console.log('');
        console.log(`   🎉 该设备的 IPv6 地址是: ${ipv6}`);
      } else {
        console.log(`   IPv6: 无`);
        console.log('');
        console.log('   ⚠️  该设备没有 IPv6 地址');
        console.log('');
        console.log('   可能的原因:');
        console.log('   1. 设备不支持 IPv6');
        console.log('   2. 设备的 IPv6 功能未启用');
        console.log('   3. 路由器未分配 IPv6 地址给该设备');
        console.log('');
        console.log('   建议:');
        console.log('   1. 检查设备的网络设置，确认 IPv6 已启用');
        console.log('   2. 检查路由器的 IPv6 配置（DHCPv6 或 SLAAC）');
        console.log('   3. 重启设备的网络连接');
      }
    } else {
      console.log('⚠️  未找到设备 192.168.9.10');
    }

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    process.exit(1);
  }
}

main();
