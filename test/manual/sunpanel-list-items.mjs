#!/usr/bin/env node
/**
 * 测试 listAllItems 函数
 */

import { listAllItems } from '../modules/sunpanel-manager/sunpanel-api.mjs';
import { getEnv } from '../shared/env-loader.mjs';

async function test() {
  console.log('🔍 测试 listAllItems 函数\n');

  const config = {
    apiBase: getEnv('SUNPANEL_API_BASE', 'http://192.168.9.2:20001/openapi/v1'),
    apiToken: getEnv('SUNPANEL_API_TOKEN'),
    username: getEnv('SUNPANEL_USERNAME'),
    password: getEnv('SUNPANEL_PASSWORD')
  };

  console.log('配置:');
  console.log(`  API Base: ${config.apiBase}`);
  console.log(`  Token: ${config.apiToken?.substring(0, 20)}...`);
  console.log(`  Username: ${config.username}\n`);

  try {
    console.log('调用 listAllItems...');
    const items = await listAllItems(config);

    console.log(`\n✅ 成功获取 ${items.length} 个卡片:\n`);

    for (const item of items) {
      console.log(`  - ${item.title} (${item.onlyName})`);
      console.log(`    分组: ${item.groupTitle}`);
      console.log(`    URL: ${item.url}`);
      console.log(`    LAN URL: ${item.lanUrl}`);
      console.log();
    }

  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
