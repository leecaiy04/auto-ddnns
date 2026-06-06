#!/usr/bin/env node
/**
 * 自动登出并重新登录以获取新 token
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
const USERNAME = getEnv('SUNPANEL_USERNAME', '');
const PASSWORD = getEnv('SUNPANEL_PASSWORD', '');

async function autoLoginAndCaptureToken() {
  console.log('🔄 自动登出并重新登录获取 Token');
  console.log('==================================\n');

  if (!USERNAME || !PASSWORD) {
    console.error('❌ 错误: 请在 .env 中设置 SUNPANEL_USERNAME 和 SUNPANEL_PASSWORD');
    process.exit(1);
  }

  let client;
  let capturedToken = null;

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

    // 检查当前 token 状态
    console.log('🔍 检查当前 token 状态...');
    const tokenCheck = await Runtime.evaluate({
      expression: `
        (function() {
          try {
            const authToken = localStorage.getItem('AUTH_TOKEN');
            if (authToken) {
              const parsed = JSON.parse(authToken);
              return {
                exists: true,
                isNull: parsed.data?.token === null || parsed.data?.token === '',
                value: parsed.data?.token
              };
            }
          } catch (e) {}
          return { exists: false, isNull: true, value: null };
        })()
      `,
      returnByValue: true
    });

    const tokenStatus = tokenCheck.result.value;
    console.log(`   Token exists: ${tokenStatus.exists}`);
    console.log(`   Token is null: ${tokenStatus.isNull}`);

    if (!tokenStatus.isNull && tokenStatus.value) {
      console.log(`   ✅ 当前 token 有效: ${tokenStatus.value.substring(0, 20)}...\n`);
      console.log('💾 更新 .env 文件...');

      const envPath = join(__dirname, '../.env');
      let envContent = readFileSync(envPath, 'utf8');

      if (envContent.includes('SUNPANEL_API_TOKEN=')) {
        envContent = envContent.replace(/SUNPANEL_API_TOKEN=.*/g, `SUNPANEL_API_TOKEN=${tokenStatus.value}`);
      } else {
        envContent += `\nSUNPANEL_API_TOKEN=${tokenStatus.value}\n`;
      }

      writeFileSync(envPath, envContent);
      console.log('✅ .env 文件已更新!');
      console.log('\n🔄 请重启服务器: npm start\n');
      return tokenStatus.value;
    }

    console.log('   Token 无效，需要重新登录\n');

    // 设置 localStorage 监听器
    console.log('📡 设置 token 监听器...');
    await Runtime.evaluate({
      expression: `
        (function() {
          window.__tokenCaptured = false;
          window.__capturedTokenValue = null;

          // 监听 localStorage 变化
          const originalSetItem = localStorage.setItem;
          localStorage.setItem = function(key, value) {
            if (key === 'AUTH_TOKEN' && !window.__tokenCaptured) {
              try {
                const parsed = JSON.parse(value);
                if (parsed.data && parsed.data.token && parsed.data.token !== null && parsed.data.token !== '') {
                  console.log('🎉 捕获到 token:', parsed.data.token);
                  window.__capturedTokenValue = parsed.data.token;
                  window.__tokenCaptured = true;
                }
              } catch (e) {}
            }
            return originalSetItem.apply(this, arguments);
          };

          console.log('✅ 监听器已激活');
        })()
      `
    });

    // 点击登出
    console.log('🚪 尝试登出...');
    const logoutResult = await Runtime.evaluate({
      expression: `
        (function() {
          // 清除 localStorage 中的 AUTH_TOKEN
          localStorage.removeItem('AUTH_TOKEN');

          // 刷新页面以显示登录界面
          window.location.reload();
          return true;
        })()
      `,
      returnByValue: true
    });

    console.log('   等待页面重新加载...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 检查是否出现登录表单
    console.log('🔍 检查登录表单...');
    const loginFormCheck = await Runtime.evaluate({
      expression: `
        (function() {
          const usernameInput = document.querySelector('input[type="text"]') ||
                               document.querySelector('input[name="username"]') ||
                               document.querySelector('input[placeholder*="用户"]') ||
                               document.querySelector('input[placeholder*="账号"]');
          const passwordInput = document.querySelector('input[type="password"]') ||
                               document.querySelector('input[name="password"]');

          return {
            hasForm: !!(usernameInput && passwordInput),
            usernameSelector: usernameInput ? usernameInput.tagName : null,
            passwordSelector: passwordInput ? passwordInput.tagName : null
          };
        })()
      `,
      returnByValue: true
    });

    if (!loginFormCheck.result.value.hasForm) {
      console.log('   ❌ 未找到登录表单');
      console.log('\n请手动操作:');
      console.log('1. 访问 http://192.168.9.10:18801');
      console.log('2. 退出登录');
      console.log('3. 重新登录');
      console.log('4. 再次运行此脚本\n');
      process.exit(1);
    }

    console.log('   ✅ 找到登录表单\n');

    // 填写并提交登录表单
    console.log('📝 填写登录表单...');
    await Runtime.evaluate({
      expression: `
        (function() {
          const usernameInput = document.querySelector('input[type="text"]') ||
                               document.querySelector('input[name="username"]') ||
                               document.querySelector('input[placeholder*="用户"]') ||
                               document.querySelector('input[placeholder*="账号"]');
          const passwordInput = document.querySelector('input[type="password"]') ||
                               document.querySelector('input[name="password"]');

          if (usernameInput) {
            usernameInput.value = '${USERNAME}';
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
          }

          if (passwordInput) {
            passwordInput.value = '${PASSWORD}';
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        })()
      `
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('🔐 提交登录...');
    await Runtime.evaluate({
      expression: `
        (function() {
          const submitBtn = document.querySelector('button[type="submit"]') ||
                           document.querySelector('button:contains("登录")') ||
                           document.querySelector('.login-btn') ||
                           Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('登录'));

          if (submitBtn) {
            submitBtn.click();
            return true;
          }

          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return true;
          }

          return false;
        })()
      `
    });

    // 等待登录完成
    console.log('⏳ 等待登录完成...\n');
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const tokenResult = await Runtime.evaluate({
        expression: 'window.__capturedTokenValue',
        returnByValue: true
      });

      if (tokenResult.result.value) {
        capturedToken = tokenResult.result.value;
        break;
      }
    }

    if (capturedToken) {
      console.log(`✅ 成功获取 token!`);
      console.log(`📋 Token: ${capturedToken}\n`);

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
      console.log('\n🔄 请重启服务器: npm start\n');

      return capturedToken;
    } else {
      console.log('❌ 登录超时，未能捕获 token\n');
      console.log('请检查:');
      console.log('1. 用户名和密码是否正确');
      console.log('2. 网络连接是否正常');
      console.log('3. 访问 http://192.168.9.10:18801 查看浏览器状态\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      try {
        await client.close();
        console.log('🔌 已断开连接');
      } catch (e) {
        // 连接已关闭
      }
    }
  }
}

autoLoginAndCaptureToken().catch(error => {
  console.error('Fatal:', error);
  process.exit(1);
});
