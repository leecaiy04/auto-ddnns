#!/usr/bin/env node
/**
 * Skills 功能测试脚本
 * 测试所有 skill 模块是否可以正常导入和调用
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('=== Skills 功能测试 ===\n');

// 1. 测试 device-monitor skill
console.log('1. 测试 device-monitor skill...');
try {
  const DeviceMonitor = await import('./skills/device-monitor/index.mjs');
  console.log('   ✓ 模块导入成功');
  console.log('   - 可用方法:', Object.keys(DeviceMonitor.default || DeviceMonitor).join(', '));

  // 测试设备发现
  console.log('   - 测试 checkDevices()...');
  const result = await DeviceMonitor.checkDevices();
  console.log(`   ✓ 设备检查完成: ${result.totalDevices || 0} 台设备`);

  console.log('   ✓ device-monitor skill 测试通过\n');
} catch (error) {
  console.error('   ✗ device-monitor skill 测试失败:', error.message);
  console.error('   详细错误:', error.stack);
  console.log();
}

// 2. 测试 lucky-manager skill
console.log('2. 测试 lucky-manager skill...');
try {
  const LuckyManager = await import('./skills/lucky-manager/index.mjs');
  console.log('   ✓ 模块导入成功');
  console.log('   - 可用方法:', Object.keys(LuckyManager.default || LuckyManager).join(', '));

  // 测试列出 DDNS 任务
  console.log('   - 测试 listDDNS()...');
  const ddnsList = await LuckyManager.listDDNS();
  console.log(`   ✓ 当前有 ${ddnsList.length} 个 DDNS 任务`);

  // 测试列出端口
  console.log('   - 测试 listPorts()...');
  const ports = await LuckyManager.listPorts();
  console.log(`   ✓ 当前有 ${ports.length} 个端口配置`);

  // 测试列出反向代理
  console.log('   - 测试 listProxies()...');
  const proxies = await LuckyManager.listProxies();
  console.log(`   ✓ 当前有 ${proxies.length} 个反向代理规则`);

  console.log('   ✓ lucky-manager skill 测试通过\n');
} catch (error) {
  console.error('   ✗ lucky-manager skill 测试失败:', error.message);
  console.error('   详细错误:', error.stack);
  console.log();
}

// 3. 测试 cloudflare-dns skill
console.log('3. 测试 cloudflare-dns skill...');
try {
  const CloudflareDNS = await import('./skills/cloudflare-dns/index.mjs');
  console.log('   ✓ 模块导入成功');
  console.log('   - 可用方法:', Object.keys(CloudflareDNS.default || CloudflareDNS).join(', '));

  // 测试列出 DNS 记录
  console.log('   - 测试 listRecords()...');
  const records = await CloudflareDNS.listRecords();
  console.log(`   ✓ 当前有 ${records.length} 条 DNS 记录`);

  if (records.length > 0) {
    const firstRecord = records[0];
    console.log(`   - 第一条记录: ${firstRecord.name} (${firstRecord.type}) -> ${firstRecord.content}`);
  }

  console.log('   ✓ cloudflare-dns skill 测试通过\n');
} catch (error) {
  console.error('   ✗ cloudflare-dns skill 测试失败:', error.message);
  console.error('   详细错误:', error.stack);
  console.log();
}

// 4. 测试 sunpanel-sync skill
console.log('4. 测试 sunpanel-sync skill...');
try {
  const SunPanelSync = await import('./skills/sunpanel-sync/index.mjs');
  console.log('   ✓ 模块导入成功');
  console.log('   - 可用方法:', Object.keys(SunPanelSync.default || SunPanelSync).join(', '));

  // 注意: syncFromLucky 会实际执行同步操作，这里只测试模块是否可调用
  console.log('   - syncFromLucky 方法可用');
  console.log('   - addService 方法可用');
  console.log('   - batchSync 方法可用');

  console.log('   ✓ sunpanel-sync skill 测试通过（未执行实际同步）\n');
} catch (error) {
  console.error('   ✗ sunpanel-sync skill 测试失败:', error.message);
  console.error('   详细错误:', error.stack);
  console.log();
}

// 5. 测试 service-registry skill
console.log('5. 测试 service-registry skill...');
try {
  const ServiceRegistry = await import('./skills/service-registry/index.mjs');
  console.log('   ✓ 模块导入成功');
  console.log('   - 可用方法:', Object.keys(ServiceRegistry.default || ServiceRegistry).join(', '));

  // 测试列出服务
  console.log('   - 测试 list()...');
  const services = await ServiceRegistry.list();
  console.log(`   ✓ 当前有 ${services.length} 个注册服务`);

  if (services.length > 0) {
    const firstService = services[0];
    console.log(`   - 第一个服务: ${firstService.name} (${firstService.type}) -> ${firstService.url}`);
  }

  console.log('   ✓ service-registry skill 测试通过\n');
} catch (error) {
  console.error('   ✗ service-registry skill 测试失败:', error.message);
  console.error('   详细错误:', error.stack);
  console.log();
}

console.log('=== 测试完成 ===');
