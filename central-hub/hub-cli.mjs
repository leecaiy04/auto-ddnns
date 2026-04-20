#!/usr/bin/env node
/**
 * Central Hub CLI 客户端
 * 局域网内查询和管理中枢服务
 */

import { program } from 'commander';
import axios from 'axios';

const HUB_URL = process.env.HUB_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: `${HUB_URL}/api`,
  timeout: 5000
});

// 健康检查
program
  .command('health')
  .description('检查服务健康状态')
  .action(async () => {
    try {
      const { data } = await api.get('/health');
      console.log('✅ 服务正常');
      console.log(`运行时间: ${data.uptime}秒`);
      console.log(`时间戳: ${data.timestamp}`);
    } catch (error) {
      console.error('❌ 服务异常:', error.message);
      process.exit(1);
    }
  });

// 获取状态
program
  .command('status')
  .description('获取整体状态')
  .action(async () => {
    try {
      const { data } = await api.get('/status');
      console.log('📊 服务状态');
      console.log(`状态: ${data.status}`);
      console.log(`运行时间: ${Math.floor(data.uptime / 60)}分钟`);
      console.log('');
      console.log('模块状态:');
      Object.entries(data.modules).forEach(([name, status]) => {
        console.log(`  ${name}: ${status}`);
      });
    } catch (error) {
      console.error('❌ 获取失败:', error.message);
    }
  });

// 获取 IP
program
  .command('ip')
  .description('获取当前公网 IP')
  .action(async () => {
    try {
      const { data } = await api.get('/ip');
      console.log('🌐 公网 IP 信息');
      console.log(`IPv4: ${data.ipv4 || 'N/A'}`);
      console.log(`IPv6: ${data.ipv6 || 'N/A'}`);
      console.log(`网关: ${data.gateway || 'N/A'}`);
      console.log(`最后检查: ${data.lastCheck || 'N/A'}`);
      console.log(`是否变更: ${data.changed ? '是' : '否'}`);
    } catch (error) {
      console.error('❌ 获取失败:', error.message);
    }
  });

// DDNS 操作
program
  .command('ddns')
  .description('获取 DDNS 状态')
  .action(async () => {
    try {
      const { data } = await api.get('/ddns');
      console.log('🌐 DDNS 状态');
      console.log(`最后更新: ${data.lastUpdate || 'N/A'}`);
    } catch (error) {
      console.error('❌ 获取失败:', error.message);
    }
  });

program
  .command('ddns:refresh')
  .description('触发 DDNS 更新')
  .action(async () => {
    try {
      console.log('🔄 触发 DDNS 更新...');
      const { data } = await api.post('/ddns/refresh');
      console.log('✅ DDNS 更新完成');
    } catch (error) {
      console.error('❌ 更新失败:', error.message);
    }
  });

// Lucky 操作
program
  .command('proxies')
  .description('获取反向代理列表')
  .action(async () => {
    try {
      const { data } = await api.get('/proxies');
      console.log(`🍀 反向代理列表 (共 ${data.count} 个)`);
      data.proxies.forEach(proxy => {
        console.log(`  - ${proxy.remark || proxy.key}`);
      });
    } catch (error) {
      console.error('❌ 获取失败:', error.message);
    }
  });

// SunPanel 操作
program
  .command('sunpanel')
  .description('获取 SunPanel 状态')
  .action(async () => {
    try {
      const { data } = await api.get('/sunpanel');
      console.log('☀️  SunPanel 状态');
      console.log(`最后同步: ${data.lastSync || 'N/A'}`);
      console.log(`卡片数量: ${data.cardCount || 0}`);
    } catch (error) {
      console.error('❌ 获取失败:', error.message);
    }
  });

program
  .command('sunpanel:sync')
  .description('触发 SunPanel 同步')
  .action(async () => {
    try {
      console.log('🔄 同步 SunPanel...');
      const { data } = await api.post('/sunpanel/sync');
      console.log('✅ 同步完成');
    } catch (error) {
      console.error('❌ 同步失败:', error.message);
    }
  });

// 解析参数
program.parse(process.argv);

// 显示帮助
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
