#!/usr/bin/env node
/**
 * Device Monitor CLI
 * 命令行工具，用于调用设备监控 skill
 */

import deviceMonitor from './index.mjs';

const action = process.argv[2];
const deviceId = process.argv[3];

async function main() {
  try {
    switch (action) {
      case 'check':
        console.log('🔍 检查所有设备...');
        const result = await deviceMonitor.checkDevices();
        console.log(JSON.stringify(result, null, 2));
        break;

      case 'get-ipv6':
        if (!deviceId) {
          console.error('❌ 请提供设备 ID');
          console.log('用法: node cli.mjs get-ipv6 <deviceId>');
          process.exit(1);
        }
        console.log(`🔍 查询设备 ${deviceId} 的 IPv6...`);
        const ipv6 = await deviceMonitor.getDeviceIPv6(deviceId);
        if (ipv6) {
          console.log(`✅ IPv6: ${ipv6}`);
        } else {
          console.log('❌ 该设备没有 IPv6 地址');
        }
        break;

      case 'get-info':
        if (!deviceId) {
          console.error('❌ 请提供设备 ID');
          console.log('用法: node cli.mjs get-info <deviceId>');
          process.exit(1);
        }
        console.log(`🔍 查询设备 ${deviceId} 的信息...`);
        const info = await deviceMonitor.getDeviceInfo(deviceId);
        if (info) {
          console.log(JSON.stringify(info, null, 2));
        } else {
          console.log('❌ 未找到该设备');
        }
        break;

      case 'list':
        console.log('📋 列出所有设备...');
        const devices = await deviceMonitor.getAllDevices();
        console.log(JSON.stringify(devices, null, 2));
        break;

      case 'status':
        console.log('📊 查询监控状态...');
        const status = await deviceMonitor.getStatus();
        console.log(JSON.stringify(status, null, 2));
        break;

      case 'ipv6-map':
        console.log('🗺️  获取 IPv6 映射表...');
        const ipv6Map = await deviceMonitor.getIPv6Map();
        console.log(JSON.stringify(ipv6Map, null, 2));
        break;

      case 'port-mapping':
        console.log('🔌 生成端口映射表...');
        const table = await deviceMonitor.generatePortMappingTable();
        console.log(JSON.stringify(table, null, 2));
        break;

      case 'help':
      default:
        console.log('Device Monitor CLI - 设备监控命令行工具\n');
        console.log('用法: node cli.mjs <action> [deviceId]\n');
        console.log('可用操作:');
        console.log('  check              - 检查所有设备的 IPv6 地址');
        console.log('  get-ipv6 <id>      - 获取指定设备的 IPv6 地址');
        console.log('  get-info <id>      - 获取指定设备的完整信息');
        console.log('  list               - 列出所有设备');
        console.log('  status             - 查看监控状态');
        console.log('  ipv6-map           - 获取 IPv6 映射表');
        console.log('  port-mapping       - 生成端口映射表');
        console.log('  help               - 显示此帮助信息\n');
        console.log('示例:');
        console.log('  node cli.mjs check');
        console.log('  node cli.mjs get-ipv6 10');
        console.log('  node cli.mjs list');
        break;
    }
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
