#!/usr/bin/env node
/**
 * 通过 CDP 获取浏览器 Cookie 并使用它删除所有卡片
 */

import CDP from 'chrome-remote-interface';
import { getEnv } from '../shared/env-loader.mjs';

const CHROME_HOST = '192.168.9.10';
const CHROME_PORT = 18801;
const SUNPANEL_URL = getEnv('SUNPANEL_API_BASE', 'http://192.168.9.2:20001').replace('/openapi/v1', '');

async function deleteAllCardsWithCookie() {
  console.log('🗑️  使用浏览器 Cookie 删除所有 SunPanel 卡片');
  console.log('===========================================\n');

  let client;

  try {
    console.log('🔗 连接到远程 Chrome...');
    client = await CDP({ host: CHROME_HOST, port: CHROME_PORT });

    const { Page, Runtime, Network } = client;
    await Page.enable();
    await Runtime.enable();
    await Network.enable();

    console.log('✅ 已连接\n');

    // 导航到 SunPanel
    console.log('🚀 访问 SunPanel...');
    await Page.navigate({ url: SUNPANEL_URL });
    await Page.loadEventFired();
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ 页面已加载\n');

    // 获取 Cookies
    console.log('🍪 获取浏览器 Cookies...');
    const { cookies } = await Network.getCookies();

    const sunpanelCookies = cookies.filter(c =>
      c.domain.includes('192.168.9.2') || c.domain.includes('20001')
    );

    console.log(`找到 ${sunpanelCookies.length} 个相关 Cookie\n`);

    if (sunpanelCookies.length === 0) {
      console.log('⚠️  未找到 Cookie，尝试自动登录...\n');

      const USERNAME = getEnv('SUNPANEL_USERNAME', '');
      const PASSWORD = getEnv('SUNPANEL_PASSWORD', '');

      if (!USERNAME || !PASSWORD) {
        console.log('❌ 请在 .env 中设置 SUNPANEL_USERNAME 和 SUNPANEL_PASSWORD\n');
        process.exit(1);
      }

      // 导航到登录页面
      await Page.navigate({ url: `${SUNPANEL_URL}/login` });
      await Page.loadEventFired();
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 填写并提交登录表单
      await Runtime.evaluate({
        expression: `
          (function() {
            const usernameInput = document.querySelector('input[type="text"]');
            const passwordInput = document.querySelector('input[type="password"]');

            if (usernameInput) {
              usernameInput.value = '${USERNAME}';
              usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            if (passwordInput) {
              passwordInput.value = '${PASSWORD}';
              passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
          })()
        `
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // 提交登录
      await Runtime.evaluate({
        expression: `
          (function() {
            const submitBtn = document.querySelector('button[type="submit"]');
            if (submitBtn) {
              submitBtn.click();
            }
          })()
        `
      });

      console.log('⏳ 等待登录完成...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 导航回主页
      await Page.navigate({ url: SUNPANEL_URL });
      await Page.loadEventFired();
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 重新获取 Cookie
      const cookiesAfterLogin = await Network.getCookies();
      const newSunpanelCookies = cookiesAfterLogin.cookies.filter(c =>
        c.domain.includes('192.168.9.2') || c.domain.includes('20001')
      );

      console.log(`所有 Cookie (${cookiesAfterLogin.cookies.length} 个):`);
      cookiesAfterLogin.cookies.forEach(c => {
        console.log(`  - ${c.name}: ${c.value.substring(0, 30)}... (domain: ${c.domain})`);
      });
      console.log();

      console.log(`✅ 登录后找到 ${newSunpanelCookies.length} 个 SunPanel Cookie\n`);

      if (newSunpanelCookies.length === 0) {
        console.log('❌ 登录失败，未获取到 Cookie\n');
        process.exit(1);
      }
    }

    // 使用 fetch 和 Cookie 删除卡片
    console.log('📋 获取所有卡片并删除...\n');
    const deleteResult = await Runtime.evaluate({
      expression: `
        (async function() {
          const deleted = [];
          const failed = [];

          try {
            // 获取所有卡片
            const response = await fetch('/api/panel/itemIcon/getListAllGroup', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              credentials: 'include'  // 关键：包含 Cookie
            });

            const data = await response.json();

            if (data.code === 0 && data.data && data.data.list) {
              for (const group of data.data.list) {
                if (group.itemInfos && Array.isArray(group.itemInfos)) {
                  for (const item of group.itemInfos) {
                    try {
                      // 使用 Cookie 删除（不需要传 token header）
                      const delResponse = await fetch('/api/panel/itemIcon/delete', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ id: item.id }),
                        credentials: 'include'  // 关键：包含 Cookie
                      });

                      const delData = await delResponse.json();

                      if (delData.code === 0) {
                        deleted.push({ title: item.title, id: item.id });
                      } else {
                        failed.push({
                          title: item.title,
                          id: item.id,
                          error: delData.msg || delData.message || 'Unknown error',
                          code: delData.code
                        });
                      }
                    } catch (e) {
                      failed.push({
                        title: item.title,
                        id: item.id,
                        error: e.message
                      });
                    }

                    // 小延迟避免过快
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

    // 验证删除结果
    console.log('🔍 验证删除结果...');
    const verifyResult = await Runtime.evaluate({
      expression: `
        (async function() {
          const response = await fetch('/api/panel/itemIcon/getListAllGroup', {
            method: 'POST',
            credentials: 'include'
          });
          const data = await response.json();

          let totalCards = 0;
          if (data.code === 0 && data.data && data.data.list) {
            for (const group of data.data.list) {
              if (group.itemInfos) {
                totalCards += group.itemInfos.length;
              }
            }
          }

          return totalCards;
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    const remainingCards = verifyResult.result.value;
    console.log(`✅ 验证完成: 远端剩余 ${remainingCards} 个卡片\n`);

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

deleteAllCardsWithCookie().catch(error => {
  console.error('Fatal:', error);
  process.exit(1);
});
