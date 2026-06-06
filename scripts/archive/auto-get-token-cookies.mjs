#!/usr/bin/env node
/**
 * 使用 CDP 特权访问获取所有 cookies（包括 HTTP-only）
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

async function captureToken() {
  console.log('🍪 通过 CDP 获取所有 Cookies');
  console.log('==============================\n');

  let client;

  try {
    console.log('🔗 连接到远程 Chrome...');
    client = await CDP({ host: CHROME_HOST, port: CHROME_PORT });

    const { Page, Network, Storage } = client;
    await Page.enable();
    await Network.enable();

    console.log('✅ 已连接\n');

    // 导航到 SunPanel
    console.log('🚀 访问 SunPanel...');
    await Page.navigate({ url: SUNPANEL_URL });
    await Page.loadEventFired();
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ 页面已加载\n');

    // 获取所有 cookies（包括 HTTP-only）
    console.log('🔍 获取所有 cookies...\n');
    const { cookies } = await Network.getCookies();

    console.log(`找到 ${cookies.length} 个 cookies:\n`);

    let capturedToken = null;

    for (const cookie of cookies) {
      const isRelevant = cookie.domain.includes('192.168.9') ||
                        cookie.domain.includes('sunpanel') ||
                        cookie.domain.includes('20001');

      if (isRelevant) {
        console.log(`📋 Cookie: ${cookie.name}`);
        console.log(`   Domain: ${cookie.domain}`);
        console.log(`   Value: ${cookie.value.substring(0, 30)}${cookie.value.length > 30 ? '...' : ''}`);
        console.log(`   HTTP-only: ${cookie.httpOnly ? 'Yes' : 'No'}`);
        console.log(`   Secure: ${cookie.secure ? 'Yes' : 'No'}`);
        console.log(`   Path: ${cookie.path}`);

        // 检查是否是 token
        const lowerName = cookie.name.toLowerCase();
        if (lowerName.includes('token') ||
            lowerName.includes('auth') ||
            lowerName.includes('session') ||
            lowerName.includes('sid')) {
          console.log(`   ⭐ 可能是认证 cookie`);

          if (!capturedToken && cookie.value.length > 10) {
            capturedToken = cookie.value;
            console.log(`   ✅ 选中此值作为 token`);
          }
        }
        console.log();
      }
    }

    if (capturedToken) {
      console.log(`\n✅ 找到候选 token: ${capturedToken}\n`);

      // 更新 .env
      console.log('💾 更新 .env 文件...');
      const envPath = join(__dirname, '../.env');
      let envContent = readFileSync(envPath, 'utf8');

      if (envContent.includes('SUNPANEL_API_TOKEN=')) {
        envContent = envContent.replace(/SUNPANEL_API_TOKEN=.*/g, `SUNPANEL_API_TOKEN=${capturedToken}`);
      } else {
        envContent += `\nSUNPANEL_API_TOKEN=${capturedToken}\n`;
      }

      writeFileSync(envPath, envContent);
      console.log('✅ .env 文件已更新!');
      console.log('\n🔄 请重启服务器测试新 token: npm start\n');

      return capturedToken;
    } else {
      console.log('\n❌ 未找到明显的 token cookie');
      console.log('\n尝试列出所有 cookie 值供手动检查:\n');

      for (const cookie of cookies) {
        if (cookie.domain.includes('192.168.9') && cookie.value.length > 20 && cookie.value.length < 100) {
          console.log(`${cookie.name}: ${cookie.value}`);
        }
      }

      console.log('\n💡 如果以上有看起来像 token 的值，可以手动测试:\n');
      console.log('   node scripts/update-sunpanel-token.mjs\n');

      process.exit(1);
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

captureToken().catch(error => {
  console.error('Fatal:', error);
  process.exit(1);
});
