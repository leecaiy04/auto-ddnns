#!/usr/bin/env node
/**
 * 通过远程 Chrome 强制重新登录并获取 token
 * 使用 Fetch domain 拦截网络请求
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

async function getTokenViaChrome() {
  console.log('🌐 通过远程 Chrome 强制重新登录获取 Token');
  console.log('=========================================\n');
  console.log(`Chrome: ${CHROME_HOST}:${CHROME_PORT}`);
  console.log(`SunPanel: ${SUNPANEL_URL}`);
  console.log(`用户名: ${USERNAME}\n`);

  if (!USERNAME || !PASSWORD) {
    console.error('❌ 错误: 请在 .env 文件中设置 SUNPANEL_USERNAME 和 SUNPANEL_PASSWORD');
    process.exit(1);
  }

  let client;
  let capturedToken = null;

  try {
    console.log('🔗 正在连接到远程 Chrome...');
    client = await CDP({
      host: CHROME_HOST,
      port: CHROME_PORT
    });

    const { Network, Page, Runtime, Storage } = client;

    await Network.enable();
    await Page.enable();
    await Runtime.enable();

    console.log('✅ 已连接\n');

    // 启用 Fetch domain 来拦截请求
    await Network.setRequestInterception({
      patterns: [{ urlPattern: '*', interceptionStage: 'HeadersReceived' }]
    });

    // 监听被拦截的请求
    Network.requestIntercepted(async (params) => {
      const { interceptionId, request, responseHeaders } = params;

      // 检查响应头
      if (responseHeaders) {
        for (const [key, value] of Object.entries(responseHeaders)) {
          if (key.toLowerCase().includes('token') && value.length > 10) {
            console.log(`🔑 在响应头中找到 token: ${key} = ${value.substring(0, 20)}...`);
            if (!capturedToken) {
              capturedToken = value;
            }
          }
        }
      }

      // 继续请求
      await Network.continueInterceptedRequest({ interceptionId });

      // 如果是登录请求，尝试获取响应体
      if (request.url.includes('/login') || request.url.includes('/account')) {
        console.log(`📡 检测到登录相关请求: ${request.url}`);
      }
    });

    // 监听响应
    Network.responseReceived(({ response }) => {
      if (response.url.includes('/api/login') || response.url.includes('/account')) {
        console.log(`📥 登录响应: ${response.status} ${response.url}`);
      }
    });

    // 监听响应体
    Network.loadingFinished(async ({ requestId }) => {
      try {
        const response = await Network.getResponseBody({ requestId });
        const body = response.body;

        try {
          const data = JSON.parse(body);
          if (data.data && data.data.token) {
            console.log(`🎉 在响应体中找到 token!`);
            if (!capturedToken) {
              capturedToken = data.data.token;
            }
          }
        } catch (e) {
          // 非 JSON
        }
      } catch (e) {
        // 无法获取响应体
      }
    });

    // 清除所有 cookies 和存储来强制退出登录
    console.log('🧹 清除浏览器会话数据...');
    await Network.clearBrowserCookies();
    await Storage.clearDataForOrigin({
      origin: SUNPANEL_URL,
      storageTypes: 'all'
    });

    console.log('✅ 会话已清除\n');

    // 导航到登录页
    console.log('🚀 正在访问 SunPanel 登录页...');
    await Page.navigate({ url: SUNPANEL_URL });
    await Page.loadEventFired();

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('✅ 页面已加载\n');

    // 检查页面内容
    console.log('🔍 检查页面状态...');
    const pageInfo = await Runtime.evaluate({
      expression: `
        (function() {
          return {
            title: document.title,
            url: window.location.href,
            hasLoginForm: !!document.querySelector('form'),
            inputCount: document.querySelectorAll('input').length,
            inputTypes: Array.from(document.querySelectorAll('input')).map(i => ({
              type: i.type,
              name: i.name,
              placeholder: i.placeholder,
              id: i.id
            })),
            bodyText: document.body.innerText.substring(0, 200)
          };
        })()
      `,
      returnByValue: true
    });

    console.log(`   页面标题: ${pageInfo.result.value.title}`);
    console.log(`   当前 URL: ${pageInfo.result.value.url}`);
    console.log(`   是否有表单: ${pageInfo.result.value.hasLoginForm ? '是' : '否'}`);
    console.log(`   输入框数量: ${pageInfo.result.value.inputCount}`);
    if (pageInfo.result.value.inputTypes.length > 0) {
      console.log(`   输入框详情:`);
      pageInfo.result.value.inputTypes.forEach((input, i) => {
        console.log(`     [${i}] type=${input.type}, name=${input.name}, placeholder=${input.placeholder}, id=${input.id}`);
      });
    }
    console.log(`   页面文本: ${pageInfo.result.value.bodyText}...\n`);

    // 如果页面已经登录（没有登录表单），尝试调用登出 API
    if (!pageInfo.result.value.hasLoginForm && pageInfo.result.value.inputCount === 0) {
      console.log('⚠️  检测到页面已登录，尝试调用登出 API...');

      await Runtime.evaluate({
        expression: `
          (async function() {
            try {
              // 尝试调用登出 API
              await fetch('/api/user/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              console.log('已调用登出 API');
            } catch (e) {
              console.log('登出 API 调用失败:', e.message);
            }

            // 刷新页面
            window.location.href = '/';
          })()
        `,
        awaitPromise: true
      });

      console.log('   等待页面跳转到登录页...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 重新检查页面
      const newPageInfo = await Runtime.evaluate({
        expression: `
          (function() {
            return {
              hasLoginForm: !!document.querySelector('form'),
              inputCount: document.querySelectorAll('input').length
            };
          })()
        `,
        returnByValue: true
      });

      console.log(`   登录表单: ${newPageInfo.result.value.hasLoginForm ? '✓' : '✗'}`);
      console.log(`   输入框数量: ${newPageInfo.result.value.inputCount}\n`);
    }

    // 填写登录表单
    console.log('📝 填写登录表单...');
    const formResult = await Runtime.evaluate({
      expression: `
        (function() {
          const usernameInput = document.querySelector('input[type="text"]') ||
                               document.querySelector('input[placeholder*="用户名"]') ||
                               document.querySelector('input[placeholder*="账号"]') ||
                               document.querySelector('input[name="username"]');
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

          return {
            usernameFound: !!usernameInput,
            passwordFound: !!passwordInput,
            usernameValue: usernameInput ? usernameInput.value : null,
            passwordValue: passwordInput ? '***' : null
          };
        })()
      `,
      returnByValue: true
    });

    if (formResult.result && formResult.result.value) {
      console.log(`   用户名输入框: ${formResult.result.value.usernameFound ? '✓' : '✗'}`);
      console.log(`   密码输入框: ${formResult.result.value.passwordFound ? '✓' : '✗'}`);
    } else {
      console.log('   ⚠️  无法找到登录表单');
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 提交登录
    console.log('🔐 提交登录...\n');
    await Runtime.evaluate({
      expression: `
        (function() {
          const submitBtn = document.querySelector('button[type="submit"]') ||
                           document.querySelector('button:contains("登录")') ||
                           document.querySelector('.login-btn') ||
                           document.querySelector('[class*="login"][class*="button"]');

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

    // 等待登录响应
    console.log('⏳ 等待登录响应...\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    if (capturedToken) {
      console.log(`✅ 成功获取 Token!`);
      console.log(`📋 Token: ${capturedToken}\n`);

      // 更新 .env 文件
      console.log('💾 正在更新 .env 文件...');
      const envPath = join(__dirname, '../.env');
      let envContent = readFileSync(envPath, 'utf8');

      if (envContent.includes('SUNPANEL_API_TOKEN=')) {
        envContent = envContent.replace(/SUNPANEL_API_TOKEN=.*/g, `SUNPANEL_API_TOKEN=${capturedToken}`);
      } else {
        envContent += `\nSUNPANEL_API_TOKEN=${capturedToken}\n`;
      }

      writeFileSync(envPath, envContent);
      console.log('✅ .env 文件已更新!');
      console.log('\n🔄 请重启服务器以应用新 token\n');

      return capturedToken;
    } else {
      throw new Error('未能捕获 token');
    }

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error('\n💡 建议:');
    console.error('1. 确认 SunPanel 登录页面可访问');
    console.error('2. 确认用户名和密码正确');
    console.error('3. 手动访问 http://192.168.9.10:18801 查看浏览器状态');
    console.error('4. 参考 docs/GET_SUNPANEL_TOKEN.md 手动获取 token\n');
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 已断开连接');
    }
  }
}

getTokenViaChrome().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
