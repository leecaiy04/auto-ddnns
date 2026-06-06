#!/usr/bin/env node
/**
 * 直接获取当前浏览器会话的所有认证信息
 * 不做任何清除操作
 */

import CDP from 'chrome-remote-interface';
import { getEnv } from '../shared/env-loader.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CHROME_HOST = '192.168.9.10';
const CHROME_PORT = 18801;
const SUNPANEL_URL = getEnv('SUNPANEL_API_BASE', 'http://192.168.9.2:20001').replace('/openapi/v1', '');

async function captureCurrentToken() {
  console.log('🔍 获取当前浏览器会话中的认证信息');
  console.log('=====================================\n');

  let client;

  try {
    console.log('🔗 连接到远程 Chrome...');
    client = await CDP({ host: CHROME_HOST, port: CHROME_PORT });

    const { Page, Network, Runtime } = client;
    await Page.enable();
    await Network.enable();
    await Runtime.enable();

    console.log('✅ 已连接\n');

    // 不导航，直接获取当前页面信息
    console.log('📋 获取当前页面信息...');
    const pageInfo = await Runtime.evaluate({
      expression: `
        (function() {
          return {
            url: window.location.href,
            title: document.title
          };
        })()
      `,
      returnByValue: true
    });

    console.log(`   URL: ${pageInfo.result.value.url}`);
    console.log(`   标题: ${pageInfo.result.value.title}\n`);

    // 如果不在 SunPanel 页面，先导航过去
    if (!pageInfo.result.value.url.includes('192.168.9.2:20001')) {
      console.log('🚀 导航到 SunPanel...');
      await Page.navigate({ url: SUNPANEL_URL });
      await Page.loadEventFired();
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('✅ 页面已加载\n');
    }

    // 获取所有 cookies
    console.log('🍪 获取 cookies...\n');
    const { cookies } = await Network.getCookies();

    const relevantCookies = cookies.filter(c =>
      c.domain.includes('192.168.9') || c.domain.includes('sunpanel')
    );

    console.log(`找到 ${relevantCookies.length} 个相关 cookies:\n`);

    let tokenCandidates = [];

    for (const cookie of relevantCookies) {
      console.log(`📋 ${cookie.name}`);
      console.log(`   Domain: ${cookie.domain}`);
      console.log(`   Value: ${cookie.value.substring(0, 50)}${cookie.value.length > 50 ? '...' : ''}`);
      console.log(`   Length: ${cookie.value.length}`);
      console.log(`   HTTP-only: ${cookie.httpOnly}`);
      console.log(`   Expires: ${cookie.expires ? new Date(cookie.expires * 1000).toISOString() : 'Session'}`);

      const lowerName = cookie.name.toLowerCase();
      if (lowerName.includes('token') ||
          lowerName.includes('auth') ||
          lowerName.includes('jwt') ||
          (cookie.value.length > 20 && cookie.value.length < 200 && /^[a-z0-9]+$/i.test(cookie.value))) {
        console.log(`   ⭐ 可能是 token`);
        tokenCandidates.push({ name: cookie.name, value: cookie.value, score: 0 });

        if (lowerName.includes('token')) tokenCandidates[tokenCandidates.length - 1].score += 10;
        if (cookie.httpOnly) tokenCandidates[tokenCandidates.length - 1].score += 5;
        if (cookie.value.length > 20 && cookie.value.length < 100) tokenCandidates[tokenCandidates.length - 1].score += 3;
      }
      console.log();
    }

    // 尝试从 localStorage 和 sessionStorage 获取
    console.log('💾 检查浏览器存储...\n');
    const storageInfo = await Runtime.evaluate({
      expression: `
        (function() {
          const items = [];

          // 检查所有 localStorage
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            if (value) {
              items.push({ source: 'localStorage', key, value, length: value.length });
            }
          }

          // 检查所有 sessionStorage
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            const value = sessionStorage.getItem(key);
            if (value) {
              items.push({ source: 'sessionStorage', key, value, length: value.length });
            }
          }

          return items;
        })()
      `,
      returnByValue: true
    });

    const storageItems = storageInfo.result.value || [];

    for (const item of storageItems) {
      console.log(`📦 ${item.source}: ${item.key}`);
      console.log(`   Length: ${item.length}`);
      console.log(`   Value: ${item.value}`);

      // 尝试解析 JSON
      try {
        const parsed = JSON.parse(item.value);
        if (parsed.token || parsed.data?.token || parsed.data?.userInfo?.token) {
          const token = parsed.token || parsed.data?.token || parsed.data?.userInfo?.token;
          console.log(`   ⭐ 找到嵌套的 token: ${token}`);
          tokenCandidates.push({ name: `${item.key}.token`, value: token, score: 15 });
        }
      } catch (e) {
        // 不是 JSON
      }

      const lowerKey = item.key.toLowerCase();
      if ((lowerKey.includes('token') || lowerKey.includes('auth')) && item.length > 10) {
        console.log(`   ⭐ 可能是 token`);
        tokenCandidates.push({ name: item.key, value: item.value, score: 8 });
      }
      console.log();
    }

    // 选择最佳候选
    if (tokenCandidates.length > 0) {
      tokenCandidates.sort((a, b) => b.score - a.score);
      const bestCandidate = tokenCandidates[0];

      console.log(`\n✅ 选择最佳候选: ${bestCandidate.name}`);
      console.log(`   Token: ${bestCandidate.value}\n`);

      // 更新 .env
      console.log('💾 更新 .env 文件...');
      const envPath = join(__dirname, '../.env');
      let envContent = readFileSync(envPath, 'utf8');

      if (envContent.includes('SUNPANEL_API_TOKEN=')) {
        envContent = envContent.replace(/SUNPANEL_API_TOKEN=.*/g, `SUNPANEL_API_TOKEN=${bestCandidate.value}`);
      } else {
        envContent += `\nSUNPANEL_API_TOKEN=${bestCandidate.value}\n`;
      }

      writeFileSync(envPath, envContent);
      console.log('✅ .env 文件已更新!');
      console.log('\n🔄 请重启服务器测试: npm start\n');

      return bestCandidate.value;
    } else {
      console.log('\n❌ 未找到任何 token 候选\n');
      console.log('可能需要重新登录。请尝试:');
      console.log('1. 访问 http://192.168.9.10:18801');
      console.log('2. 手动退出登录');
      console.log('3. 重新登录');
      console.log('4. 再次运行此脚本\n');
      process.exit(1);
    }

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

captureCurrentToken().catch(error => {
  console.error('Fatal:', error);
  process.exit(1);
});
