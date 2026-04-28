#!/usr/bin/env node
/**
 * Central Hub CLI 客户端
 * 局域网内查询和管理中枢服务
 */

import { program } from 'commander';
import axios from 'axios';

const HUB_URL = process.env.HUB_URL || 'http://localhost:51000';

const api = axios.create({
  baseURL: `${HUB_URL}/api`,
  timeout: 5000
});

async function request(method, url) {
  const { data } = await api.request({ method, url });
  return data;
}

program
  .command('health')
  .description('检查服务健康状态')
  .action(async () => {
    try {
      const data = await request('GET', '/health');
      console.log('✅ 服务正常');
      console.log(`运行时间: ${data.uptime}秒`);
      console.log(`时间戳: ${data.timestamp}`);
      console.log(`版本: ${data.version}`);
    } catch (error) {
      console.error('❌ 服务异常:', error.message);
      process.exit(1);
    }
  });

program
  .command('overview')
  .description('获取概览信息')
  .action(async () => {
    try {
      const data = await request('GET', '/dashboard/overview');
      console.log('📈 概览');
      console.log(`任务数: ${data.coordinator?.tasks || 0}`);
      console.log(`设备总数: ${data.devices?.total || 0}`);
      console.log(`IPv6 就绪: ${data.devices?.ipv6Ready || 0}`);
      console.log(`服务总数: ${data.services?.total || 0}`);
      console.log(`Lucky 代理数: ${data.proxies?.luckyActual ?? data.proxies?.lucky ?? 0}`);
      console.log(`DDNS 任务数: ${data.ddns?.taskCount || 0}`);
      console.log(`Cloudflare 启用: ${data.cloudflare?.enabled ? '是' : '否'}`);
    } catch (error) {
      console.error('❌ 获取失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('获取整体状态')
  .action(async () => {
    try {
      const data = await request('GET', '/dashboard/status');
      console.log('📊 服务状态');
      console.log(`协调器运行中: ${data.coordinator?.isRunning ? '是' : '否'}`);
      console.log(`已调度任务: ${(data.coordinator?.scheduledTasks || []).join(', ') || '无'}`);
      console.log('');

      if (data.deviceMonitor) {
        console.log(`设备监控: ${data.deviceMonitor.totalDevices || 0} 台，IPv6 就绪 ${data.deviceMonitor.ipv6Ready || 0} 台`);
      }
      if (data.serviceRegistry) {
        console.log(`服务清单: ${data.serviceRegistry.totalServices || 0} 个服务`);
      }
      if (data.lucky) {
        console.log(`Lucky: ${data.lucky.proxyCount || 0} 个代理，端口 ${data.lucky.port || 'N/A'}`);
      }
      if (data.ddns) {
        console.log(`DDNS: ${data.ddns.enabled ? '启用' : '禁用'}，任务 ${data.ddns.ddnsTasks?.length || 0} 个`);
      }
      if (data.sunpanel) {
        console.log(`SunPanel: ${data.sunpanel.cardsCount || 0} 张卡片`);
      }
      if (data.cloudflare) {
        console.log(`Cloudflare: ${data.cloudflare.enabled ? '启用' : '禁用'}`);
      }
    } catch (error) {
      console.error('❌ 获取失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('ip')
  .description('获取设备 IPv6 概览（兼容旧命令名）')
  .action(async () => {
    try {
      const data = await request('GET', '/dashboard/overview');
      console.log('🌐 设备 IPv6 概览');
      console.log(`设备总数: ${data.devices?.total || 0}`);
      console.log(`IPv6 就绪: ${data.devices?.ipv6Ready || 0}`);
      console.log(`最后更新: ${data.devices?.lastUpdate || 'N/A'}`);
    } catch (error) {
      console.error('❌ 获取失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('ddns')
  .description('获取 DDNS 状态')
  .action(async () => {
    try {
      const data = await request('GET', '/ddns');
      console.log('🌐 DDNS 状态');
      console.log(`任务总数: ${data.total || 0}`);
      console.log(`成功: ${data.success ? '是' : '否'}`);
    } catch (error) {
      console.error('❌ 获取失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('ddns:refresh')
  .description('触发 DDNS 调和')
  .action(async () => {
    try {
      console.log('🔄 触发 DDNS 调和...');
      const data = await request('POST', '/ddns/refresh');
      console.log('✅ DDNS 调和完成');
      console.log(`创建: ${data.created || 0}`);
      console.log(`删除: ${data.removed || 0}`);
      console.log(`未变: ${data.unchanged || 0}`);
    } catch (error) {
      console.error('❌ 更新失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('proxies')
  .description('获取 Lucky 代理状态')
  .action(async () => {
    try {
      const data = await request('GET', '/proxies');
      console.log('🍀 Lucky 状态');
      console.log(`启用: ${data.enabled ? '是' : '否'}`);
      console.log(`端口: ${data.port || 'N/A'}`);
      console.log(`代理数: ${data.proxyCount || 0}`);
      console.log(`最后同步: ${data.lastSync || 'N/A'}`);
    } catch (error) {
      console.error('❌ 获取失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('sunpanel')
  .description('获取 SunPanel 状态')
  .action(async () => {
    try {
      const data = await request('GET', '/dashboard/status');
      console.log('☀️  SunPanel 状态');
      console.log(`最后同步: ${data.sunpanel?.lastSync || 'N/A'}`);
      console.log(`卡片数量: ${data.sunpanel?.cardsCount || 0}`);
    } catch (error) {
      console.error('❌ 获取失败:', error.message);
      process.exit(1);
    }
  });

program
  .command('sunpanel:sync')
  .description('触发 SunPanel 同步')
  .action(async () => {
    try {
      console.log('🔄 同步 SunPanel...');
      await request('POST', '/sync/sunpanel');
      console.log('✅ 同步完成');
    } catch (error) {
      console.error('❌ 同步失败:', error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
