#!/usr/bin/env node

/**
 * Auto-DNNS CLI 工具
 * 允许通过命令行执行各类同步与管理任务，便于 OpenClaw Skill 调用
 */

import CentralHub from './central-hub/server.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

// 预检核心环境变量
function checkEnv() {
  const envPath = path.resolve(MODULE_DIR, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ 缺少 .env 文件，请参考 .env.template 创建并配置必要变量。');
    process.exit(1);
  }
}

async function runAction(action) {
  checkEnv();
  console.log(`🚀 开始初始化模块用于执行 task: ${action}...`);
  
  const configPath = path.resolve(MODULE_DIR, 'config', 'hub.json');
  const hub = new CentralHub(configPath);
  
  try {
    await hub.loadConfig();
    await hub.initModules();
  } catch (error) {
    console.error('❌ 模块初始化失败，请检查配置:', error.message);
    process.exit(1);
  }

  const modules = hub.modules;

  try {
    switch (action) {
      case 'sync-all':
        console.log('⚡ 执行完整同步...');
        await modules.coordinator.runFullSync();
        break;
      case 'sync-ddns':
        console.log('🌍 执行 DDNS 更新...');
        await modules.ddnsController.update(true);
        break;
      case 'sync-lucky':
        console.log('🎲 执行 Lucky 代理同步...');
        await modules.serviceRegistry.loadRegistry();
        await modules.luckyManager.syncServicesToLucky(modules.serviceRegistry.getAllServices());
        break;
      case 'sync-npm':
        console.log('📋 执行 NPM 代理同步...');
        await modules.serviceRegistry.loadRegistry();
        await modules.npmManager.syncServicesToNPM(modules.serviceRegistry.getAllServices());
        break;
      case 'sync-cloudflare':
        console.log('☁️ 执行 Cloudflare DNS 同步...');
        await modules.serviceRegistry.loadRegistry();
        await modules.cloudflareManager.syncServicesToCloudflare(modules.serviceRegistry.getAllServices());
        break;
      case 'sync-sunpanel':
        console.log('🌞 执行 SunPanel 同步...');
        await modules.serviceRegistry.loadRegistry();
        await modules.luckyManager.syncToSunPanel(modules.serviceRegistry.getAllServices());
        break;
      case 'monitor':
        console.log('📡 执行设备发现监控...');
        await modules.deviceMonitor.runDiscovery();
        break;
      default:
        console.error(`❌ 未知任务: ${action}`);
        process.exit(1);
    }
    console.log('✅ 任务执行成功结束。');
    process.exit(0);
  } catch (error) {
    console.error(`❌ 任务执行失败: ${error.message}`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === 'help') {
  console.log(`
Auto-DNNS CLI 命令行工具 (Skill 支持)

用法:
  node cli.mjs <任务名>

支持的任务:
  sync-all          执行完整同步 (设备发现 -> DDNS -> 代理 -> SunPanel)
  sync-ddns         仅执行 DDNS 更新
  sync-lucky        仅同步反代记录到 Lucky
  sync-npm          仅同步反代记录到 NPM (如果启用)
  sync-cloudflare   仅同步 DNS 记录到 Cloudflare (如果启用)
  sync-sunpanel     仅同步服务及书签卡片到 SunPanel
  monitor           仅执行局域网 IPv6 与服务状态监控
  help              显示此帮助信息
  `);
  process.exit(0);
}

runAction(args[0]);
