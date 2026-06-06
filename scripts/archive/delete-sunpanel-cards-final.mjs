#!/usr/bin/env node
/**
 * 在浏览器上下文中直接使用 fetch 删除卡片
 * 利用浏览器已登录的会话状态
 */

import CDP from 'chrome-remote-interface';
import { getEnv } from '../shared/env-loader.mjs';

const CHROME_HOST = '192.168.9.10';
const CHROME_PORT = 18801;
const SUNPANEL_URL = getEnv('SUNPANEL_API_BASE', 'http://192.168.9.2:20001').replace('/openapi/v1', '');
const USERNAME = getEnv('SUNPANEL_USERNAME', '');
const PASSWORD = getEnv('SUNPANEL_PASSWORD', '');

async function ensureLoggedIn(Page, Runtime) {
  // 检查是否已登录
  const loginCheck = await Runtime.evaluate({
    expression: `
      (function() {
        try {
          const authToken = localStorage.getItem('AUTH_TOKEN');
          if (authToken) {
            const parsed = JSON.parse(authToken);
            return {
              loggedIn: parsed.data?.token && parsed.data.token !== null,
              token: parsed.data?.token
            };
          }
        } catch (e) {}
        return { loggedIn: false, token: null };
      })()
    `,
    returnByValue: true
  });

  if (loginCheck.result.value.loggedIn) {
    console.log('✅ 已登录\n');
    return true;
  }

  console.log('⚠️  未登录，尝试自动登录...\n');

  if (!USERNAME || !PASSWORD) {
    console.log('❌ 请在 .env 中设置 SUNPANEL_USERNAME 和 SUNPANEL_PASSWORD\n');
    return false;
  }

  // 清除所有数据
  await Runtime.evaluate({
    expression: `
      (function() {
        localStorage.clear();
        sessionStorage.clear();
      })()
    `
  });

  // 导航到登录页面
  await Page.navigate({ url: `${SUNPANEL_URL}/login` });
  await Page.loadEventFired();
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 填写并提交登录
  await Runtime.evaluate({
    expression: `
      (function() {
        const usernameInput = document.querySelector('input[type="text"]');
        const passwordInput = document.querySelector('input[type="password"]');

        if (usernameInput && passwordInput) {
          usernameInput.value = '${USERNAME}';
          usernameInput.dispatchEvent(new Event('input', { bubbles: true }));

          passwordInput.value = '${PASSWORD}';
          passwordInput.dispatchEvent(new Event('input', { bubbles: true }));

          setTimeout(() => {
            const submitBtn = document.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.click();
          }, 500);
        }
      })()
    `
  });

  console.log('⏳ 等待登录完成...');
  await new Promise(resolve => setTimeout(resolve, 4000));

  // 导航回主页
  await Page.navigate({ url: SUNPANEL_URL });
  await Page.loadEventFired();
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 再次检查登录状态
  const recheckLogin = await Runtime.evaluate({
    expression: `
      (function() {
        try {
          const authToken = localStorage.getItem('AUTH_TOKEN');
          if (authToken) {
            const parsed = JSON.parse(authToken);
            return parsed.data?.token && parsed.data.token !== null;
          }
        } catch (e) {}
        return false;
      })()
    `,
    returnByValue: true
  });

  if (recheckLogin.result.value) {
    console.log('✅ 登录成功\n');
    return true;
  } else {
    console.log('❌ 登录失败\n');
    return false;
  }
}

async function deleteAllCards() {
  console.log('🗑️  删除所有 SunPanel 卡片');
  console.log('============================\n');

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
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 确保已登录
    const loggedIn = await ensureLoggedIn(Page, Runtime);
    if (!loggedIn) {
      process.exit(1);
    }

    // 删除所有卡片
    console.log('📋 获取并删除所有卡片...\n');
    const deleteResult = await Runtime.evaluate({
      expression: `
        (async function() {
          const deleted = [];
          const failed = [];

          try {
            // 获取所有卡片
            const response = await fetch('/api/panel/itemIcon/getListAllGroup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (data.code === 0 && data.data && data.data.list) {
              for (const group of data.data.list) {
                if (group.itemInfos && Array.isArray(group.itemInfos)) {
                  for (const item of group.itemInfos) {
                    try {
                      const delResponse = await fetch('/api/panel/itemIcon/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: item.id })
                      });

                      // 检查响应类型
                      const contentType = delResponse.headers.get('content-type');
                      const isJson = contentType && contentType.includes('application/json');

                      if (!isJson) {
                        const text = await delResponse.text();
                        failed.push({
                          title: item.title,
                          id: item.id,
                          error: 'API returned HTML instead of JSON',
                          responsePreview: text.substring(0, 100),
                          contentType: contentType
                        });
                        continue;
                      }

                      const delData = await delResponse.json();

                      if (delData.code === 0) {
                        deleted.push({ title: item.title, id: item.id });
                      } else {
                        failed.push({
                          title: item.title,
                          id: item.id,
                          error: delData.msg || 'Unknown error',
                          code: delData.code
                        });
                      }
                    } catch (e) {
                      failed.push({ title: item.title, id: item.id, error: e.message });
                    }

                    await new Promise(r => setTimeout(r, 100));
                  }
                }
              }
            }

            return { deleted, failed };
          } catch (e) {
            return { error: e.message, deleted: [], failed: [] };
          }
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

    console.log(`✅ 删除完成:`);
    console.log(`   成功: ${result.deleted.length} 个`);
    console.log(`   失败: ${result.failed.length} 个\n`);

    if (result.deleted.length > 0) {
      console.log('已删除的卡片:');
      result.deleted.forEach(item => console.log(`  - ${item.title} (ID: ${item.id})`));
      console.log();
    }

    if (result.failed.length > 0) {
      console.log('删除失败的卡片:');
      result.failed.forEach(item => {
        console.log(`  - ${item.title} (ID: ${item.id})`);
        console.log(`    错误: ${item.error} (code: ${item.code})`);
      });
      console.log();
    }

    // 验证
    console.log('🔍 验证删除结果...');
    const verifyResult = await Runtime.evaluate({
      expression: `
        (async function() {
          const response = await fetch('/api/panel/itemIcon/getListAllGroup', { method: 'POST' });
          const data = await response.json();

          let totalCards = 0;
          if (data.code === 0 && data.data && data.data.list) {
            for (const group of data.data.list) {
              if (group.itemInfos) totalCards += group.itemInfos.length;
            }
          }

          return totalCards;
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const remaining = verifyResult.result.value;
    console.log(`✅ 验证完成: 远端剩余 ${remaining} 个卡片\n`);

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
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
