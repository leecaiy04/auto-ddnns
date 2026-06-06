#!/usr/bin/env node
/**
 * 简单的 IPv6 查询工具 - 直接查询指定 IP 的设备
 * 用法: node scripts/simple-ipv6-query.mjs <设备IP>
 * 示例: node scripts/simple-ipv6-query.mjs 192.168.9.10
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const targetIp = process.argv[2];
if (!targetIp) {
  console.error('❌ 请提供设备 IP 地址');
  console.error('用法: node scripts/simple-ipv6-query.mjs <设备IP>');
  console.error('示例: node scripts/simple-ipv6-query.mjs 192.168.9.10');
  process.exit(1);
}

console.log(`🔍 正在查询设备 ${targetIp} 的 IPv6 地址...`);
console.log('');

async function main() {
  try {
    // 方法 1: 尝试 ping 设备以更新邻居表
    console.log('📡 Ping 设备以更新邻居表...');
    try {
      await execAsync(`ping -c 1 -W 1 ${targetIp}`);
      console.log('   ✅ 设备在线');
    } catch {
      console.log('   ⚠️  设备可能离线');
    }
    console.log('');

    // 方法 2: 查询本地 IPv6 邻居表
    console.log('📡 查询本地 IPv6 邻居表...');
    try {
      const { stdout } = await execAsync('ip -6 neigh show');
      const lines = stdout.split('\n');

      // 先获取设备的 MAC 地址
      const arpResult = await execAsync(`ip neigh show ${targetIp}`);
      const arpMatch = arpResult.stdout.match(/lladdr\s+([0-9a-f:]+)/i);

      if (!arpMatch) {
        console.log(`   ❌ 未找到设备 ${targetIp} 的 MAC 地址`);
        console.log('');
        console.log('可能的原因:');
        console.log('1. 设备不在同一网段');
        console.log('2. 设备离线');
        console.log('3. ARP 表中没有该设备');
        process.exit(1);
      }

      const mac = arpMatch[1].toLowerCase();
      console.log(`   MAC 地址: ${mac}`);

      // 查找对应的 IPv6 地址
      let ipv6Found = false;
      for (const line of lines) {
        if (line.toLowerCase().includes(mac)) {
          const ipv6Match = line.match(/^([0-9a-f:]+)/i);
          if (ipv6Match) {
            const ipv6 = ipv6Match[1];
            console.log('');
            console.log('✅ 查询成功！');
            console.log('');
            console.log(`设备信息:`);
            console.log(`  IPv4: ${targetIp}`);
            console.log(`  MAC:  ${mac}`);
            console.log(`  IPv6: ${ipv6}`);
            console.log('');
            console.log(`🎉 设备的 IPv6 地址是: ${ipv6}`);
            ipv6Found = true;
            break;
          }
        }
      }

      if (!ipv6Found) {
        console.log('');
        console.log(`⚠️  未找到设备 ${targetIp} 的 IPv6 地址`);
        console.log('');
        console.log('可能的原因:');
        console.log('1. 设备不支持 IPv6');
        console.log('2. 网络未启用 IPv6');
        console.log('3. 设备未获取到 IPv6 地址');
        console.log('');
        console.log('提示: 可以尝试:');
        console.log(`  1. ping6 ${targetIp}  # 如果设备支持 IPv6`);
        console.log(`  2. 检查路由器的 IPv6 配置`);
      }

    } catch (error) {
      console.error('   ❌ 查询失败:', error.message);
    }

  } catch (error) {
    console.error('');
    console.error('❌ 查询失败:', error.message);
    process.exit(1);
  }
}

main();
