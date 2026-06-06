#!/usr/bin/env node
/**
 * 通过 CDP 控制浏览器删除所有 SunPanel 卡片
 */

import CDP from 'chrome-remote-interface';
import { getEnv } from '../shared/env-loader.mjs';

const CHROME_HOST = '192.168.9.10';
const CHROME_PORT = 18801;
const SUNPANEL_URL = getEnv('SUNPANEL_API_BASE', 'http://192.168.9.2:20001').replace('/openapi/v1', '');

async function deleteAllCards() {
  console.log('🗑️  通过浏览器自动删除所有 SunPanel 卡片');
  console.log('=========================================\n');

  let client;

  try {
    console.log('🔗 连接到远程 Chrome...');
    client = await CDP({ host: CHROME_HOST, port: CHROME_PORT });

    const { Page, Runtime } = client;
    await Page.enable();
    await Runtime.enable();

    console.log('✅ 已连接\n');

    // 导航到 SunPanel
    console.log('🚀 访问 SunPanel...');
    await Page.navigate({ url: SUNPANEL_URL });
    await Page.loadEventFired();
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('✅ 页面已加载\n');

    // 获取所有卡片
    console.log('📋 获取所有卡片...');
    const cardsInfo = await Runtime.evaluate({
      expression: `
        (function() {
          const cards = Array.from(document.querySelectorAll('[class*="item-card"], [class*="icon-item"], [data-onlyname]'));
          return {
            count: cards.length,
            cards: cards.slice(0, 10).map(c => ({
              text: c.innerText?.substring(0, 50),
              classes: c.className
            }))
          };
        })()
      `,
      returnByValue: true
    });

    console.log(`找到 ${cardsInfo.result.value.count} 个卡片元素\n`);

    // 使用 localStorage API 删除
    console.log('🔄 使用 localStorage API 删除卡片...\n');

    // 通过 localStorage 获取卡片列表并删除
    const deleteResult = await Runtime.evaluate({
      expression: `
        (async function() {
          const token = localStorage.getItem('AUTH_TOKEN');
          if (!token) {
            return { error: '未找到 token' };
          }

          const parsed = JSON.parse(token);
          const authToken = parsed.data?.token;

          if (!authToken) {
            return { error: 'token 无效' };
          }

          // 获取所有卡片
          const response = await fetch('/api/panel/itemIcon/getListAllGroup', {
            method: 'POST',
            headers: {
              'token': authToken,
              'Content-Type': 'application/json'
            }
          });

          const data = await response.json();
          const deleted = [];
          const failed = [];

          if (data.code === 0 && data.data && data.data.list) {
            for (const group of data.data.list) {
              if (group.itemInfos && Array.isArray(group.itemInfos)) {
                for (const item of group.itemInfos) {
                  // 尝试删除
                  try {
                    const delResponse = await fetch('/api/panel/itemIcon/delete', {
                      method: 'POST',
                      headers: {
                        'token': authToken,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({ id: item.id })
                    });

                    const delData = await delResponse.json();
                    if (delData.code === 0) {
                      deleted.push(item.title);
                    } else {
                      failed.push({ title: item.title, error: delData.msg });
                    }
                  } catch (e) {
                    failed.push({ title: item.title, error: e.message });
                  }

                  // 小延迟
                  await new Promise(r => setTimeout(r, 200));
                }
              }
            }
          }

          return { deleted, failed };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const result = deleteResult.result.value;

    if (result.error) {
      console.log(`❌ 错误: ${result.error}\n`);
      process.exit(1);
    }

    console.log(`\n✅ 删除完成:`);
    console.log(`   成功: ${result.deleted.length} 个`);
    console.log(`   失败: ${result.failed.length} 个\n`);

    if (result.deleted.length > 0) {
      console.log('已删除的卡片:');
      result.deleted.forEach(title => console.log(`  - ${title}`));
      console.log();
    }

    if (result.failed.length > 0) {
      console.log('删除失败的卡片:');
      result.failed.forEach(item => console.log(`  - ${item.title}: ${item.error}`));
      console.log();
    }

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 已断开连接');
    }
  }
}

deleteAllCards().catch(error => {
  console.error('Fatal:', error);
  process.exit(1);
});
