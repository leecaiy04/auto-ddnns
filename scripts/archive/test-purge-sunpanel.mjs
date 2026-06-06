#!/usr/bin/env node
/**
 * 测试 SunPanelManager 配置和 purgeSunPanel 函数
 */

import { SunPanelManager } from '../modules/sunpanel-manager/index.mjs';
import { StateManager } from '../shared/state-manager.mjs';
import { loadConfigWithEnv } from '../shared/config-loader.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function test() {
  console.log('🔍 测试 SunPanelManager.purgeSunPanel()\n');

  try {
    // 加载配置
    const configPath = path.join(__dirname, '../central-hub/config/hub.json');
    console.log('加载配置:', configPath);
    let config = await loadConfigWithEnv(configPath);

    // 应用运行时覆盖（模拟 server.mjs 的逻辑）
    if (config?.modules?.sunpanel) {
      const sunInstances = [];
      if (process.env.SUNPANEL_API_BASE) {
        sunInstances.push({
          apiBase: process.env.SUNPANEL_API_BASE,
          apiToken: process.env.SUNPANEL_API_TOKEN,
          username: process.env.SUNPANEL_USERNAME,
          password: process.env.SUNPANEL_PASSWORD
        });
      }
      config.modules.sunpanel.instances = sunInstances;
    }

    console.log('SunPanel 配置:');
    console.log(JSON.stringify(config.modules.sunpanel, null, 2));
    console.log();

    // 初始化 StateManager
    const stateManager = new StateManager('central-hub/data/hub-state.json');
    await stateManager.init();

    // 初始化 SunPanelManager
    console.log('初始化 SunPanelManager...');
    const sunpanelManager = new SunPanelManager(config.modules.sunpanel, stateManager);
    await sunpanelManager.init();
    console.log('✅ 初始化完成\n');

    // 调用 purgeSunPanel
    console.log('调用 purgeSunPanel()...\n');
    const result = await sunpanelManager.purgeSunPanel();

    console.log('\n✅ 结果:');
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
