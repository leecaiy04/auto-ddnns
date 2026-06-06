#!/usr/bin/env node
/**
 * 通过远程 Chrome 实例自动登录 SunPanel 并获取 token
 * 使用 Chrome DevTools Protocol 连接到 192.168.9.10:18801
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
  console.log('🌐 通过远程 Chrome 自动获取 SunPanel Token');
  console.log('==========================================\n');
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
    // 连接到远程 Chrome
    console.log('🔗 正在连接到远程 Chrome...');
    client = await CDP({
      host: CHROME_HOST,
      port: CHROME_PORT
    });

    const { Network, Page, Runtime } = client;

    // 启用必要的域
    await Network.enable();
    await Page.enable();
    await Runtime.enable();

    console.log('✅ 已连接到 Chrome\n');

    // 存储请求ID映射和捕获的 token
    const requestMap = new Map();
    let tokenFromHeaders = null;

    // 监听网络请求
    Network.requestWillBeSent(({ requestId, request }) => {
      requestMap.set(requestId, request.url);

      // 检查请求头中是否有 token
      if (request.headers) {
        const possibleTokenHeaders = ['token', 'authorization', 'x-token', 'auth-token', 'access-token'];
        for (const headerName of possibleTokenHeaders) {
          const lowerHeaderName = headerName.toLowerCase();
          for (const [key, value] of Object.entries(request.headers)) {
            if (key.toLowerCase() === lowerHeaderName && value && value.length > 10) {
              console.log(`🔑 在请求头中发现 token: ${key} = ${value.substring(0, 20)}...`);
              if (!tokenFromHeaders) {
                tokenFromHeaders = value.replace(/^Bearer\s+/i, ''); // 移除 Bearer 前缀
              }
            }
          }
        }
      }

      if (request.url.includes('/api/') || request.url.includes('/login')) {
        console.log(`📤 请求: ${request.method} ${request.url}`);
      }
    });

    // 监听网络响应
    Network.responseReceived(({ requestId, response }) => {
      const url = requestMap.get(requestId) || response.url;
      if (url.includes('/api/') || url.includes('/login')) {
        console.log(`📥 响应: ${response.status} ${url}`);
      }
    });

    // 监听网络响应体
    const responsePromise = new Promise((resolve) => {
      Network.loadingFinished(async ({ requestId }) => {
        const url = requestMap.get(requestId);
        if (!url) return;

        // 只处理 API 相关的请求
        if (!url.includes('/api/') && !url.includes('/login')) return;

        try {
          const response = await Network.getResponseBody({ requestId });
          const body = response.body;

          // 尝试解析 JSON 响应
          try {
            const data = JSON.parse(body);
            console.log(`🔍 检查响应: ${url.substring(url.lastIndexOf('/'))}`);
            console.log(`   数据:`, JSON.stringify(data).substring(0, 150));

            if (data.data && data.data.token) {
              console.log('🎉 成功捕获 Token!');
              capturedToken = data.data.token;
              resolve(capturedToken);
            }
          } catch (e) {
            // 非 JSON 响应，忽略
          }
        } catch (e) {
          // 无法获取响应体，忽略
        }
      });
    });

    // 导航到 SunPanel 登录页
    console.log('🚀 正在访问 SunPanel...');
    await Page.navigate({ url: SUNPANEL_URL });
    await Page.loadEventFired();

    // 等待页面加载和网络请求
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('✅ 页面已加载\n');

    // 如果已经从请求头中捕获到 token，直接使用
    if (tokenFromHeaders) {
      console.log(`✅ 从请求头中提取到 token: ${tokenFromHeaders.substring(0, 20)}...\n`);
      capturedToken = tokenFromHeaders;

      console.log(`📋 完整 Token: ${capturedToken}`);
      console.log(`\n💾 正在更新 .env 文件...`);

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
    }

    // 尝试从 cookies 中提取 token
    console.log('🔍 尝试从 cookies 中提取 token...');
    const { cookies } = await Network.getAllCookies();

    for (const cookie of cookies) {
      if (cookie.domain.includes('192.168.9.2') || cookie.domain.includes('sunpanel')) {
        console.log(`🍪 Cookie: ${cookie.name} = ${cookie.value.substring(0, 30)}... (domain: ${cookie.domain})`);

        // 检查可能包含 token 的 cookie
        if (cookie.name.toLowerCase().includes('token') ||
            cookie.name.toLowerCase().includes('auth') ||
            (cookie.value.length > 20 && cookie.value.length < 100 && /^[a-z0-9]+$/i.test(cookie.value))) {
          console.log(`✅ 找到可能的 token cookie: ${cookie.name}`);
          if (!capturedToken) {
            capturedToken = cookie.value;
          }
        }
      }
    }

    if (capturedToken) {
      console.log(`\n📋 完整 Token: ${capturedToken}`);
      console.log(`\n💾 正在更新 .env 文件...`);

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
    }

    console.log('⚠️  未在 cookies 中找到 token\n');

    // 尝试通过 JavaScript 拦截下一个 API 请求
    console.log('🔍 尝试通过拦截 API 请求获取 token...');
    const { result: interceptedToken } = await Runtime.evaluate({
      expression: `
        (function() {
          return new Promise((resolve) => {
            let captured = null;

            // 拦截 fetch
            const originalFetch = window.fetch;
            window.fetch = function(...args) {
              const [url, options] = args;

              // 检查请求头
              if (options && options.headers) {
                const headers = options.headers;
                for (const [key, value] of Object.entries(headers)) {
                  if (key.toLowerCase().includes('token') ||
                      key.toLowerCase().includes('auth') ||
                      key.toLowerCase() === 'authorization') {
                    captured = value.replace(/^Bearer\\s+/i, '');
                    resolve(captured);
                    return originalFetch.apply(this, args);
                  }
                }
              }

              return originalFetch.apply(this, args);
            };

            // 触发一个 API 请求来捕获 token
            fetch('/api/user/getAuthInfo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            }).then(() => {
              setTimeout(() => {
                window.fetch = originalFetch;
                resolve(captured);
              }, 500);
            });
          });
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    if (interceptedToken.value) {
      capturedToken = interceptedToken.value;
      console.log(`✅ 通过拦截捕获到 token: ${capturedToken.substring(0, 20)}...\n`);

      console.log(`📋 完整 Token: ${capturedToken}`);
      console.log(`\n💾 正在更新 .env 文件...`);

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
    }

    console.log('⚠️  未能通过拦截捕获 token\n');

    // 首先尝试从浏览器存储中提取 token
    console.log('🔍 尝试从浏览器存储中提取 token...');
    const { result: storageToken } = await Runtime.evaluate({
      expression: `
        (function() {
          // 检查各种可能的存储位置
          const possibleKeys = ['token', 'auth_token', 'access_token', 'sunpanel_token', 'Authorization', 'x-token'];

          // 检查 localStorage
          for (const key of possibleKeys) {
            const value = localStorage.getItem(key);
            if (value && value.length > 10) {
              return { source: 'localStorage', key, value };
            }
          }

          // 检查 sessionStorage
          for (const key of possibleKeys) {
            const value = sessionStorage.getItem(key);
            if (value && value.length > 10) {
              return { source: 'sessionStorage', key, value };
            }
          }

          // 检查所有 localStorage 键值
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            if (value && value.length > 20 && value.length < 100 && /^[a-z0-9]+$/i.test(value)) {
              return { source: 'localStorage', key, value };
            }
          }

          return null;
        })()
      `
    });

    if (storageToken.value) {
      const { source, key, value } = storageToken.value;
      console.log(`✅ 找到 token (来源: ${source}, 键: ${key})`);
      capturedToken = value;

      // 直接返回 token，不需要等待登录请求
      console.log(`\n📋 Token: ${capturedToken}`);
      console.log(`\n💾 正在更新 .env 文件...`);

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
    }

    console.log('⚠️  未在浏览器存储中找到 token\n');

    // 检查是否已经登录
    const { result: isLoggedIn } = await Runtime.evaluate({
      expression: `
        (function() {
          return !document.querySelector('input[type="text"]') &&
                 !document.querySelector('input[placeholder*="用户名"]') &&
                 !document.querySelector('input[placeholder*="账号"]');
        })()
      `
    });

    if (isLoggedIn.value) {
      console.log('ℹ️  检测到已登录状态但无法提取 token');
      console.log('💡 建议: 在浏览器中手动退出登录，然后重新运行此脚本\n');
      throw new Error('页面已登录但无法提取 token');
    }

    // 填写登录表单
    console.log('📝 正在填写登录表单...');
    await Runtime.evaluate({
      expression: `
        (function() {
          const usernameInput = document.querySelector('input[type="text"]') ||
                               document.querySelector('input[placeholder*="用户名"]') ||
                               document.querySelector('input[placeholder*="账号"]');
          const passwordInput = document.querySelector('input[type="password"]');

          if (usernameInput) {
            usernameInput.value = '${USERNAME}';
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
          }

          if (passwordInput) {
            passwordInput.value = '${PASSWORD}';
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
          }

          return { usernameFound: !!usernameInput, passwordFound: !!passwordInput };
        })()
      `
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 提交表单
    console.log('🔐 正在提交登录...');
    await Runtime.evaluate({
      expression: `
        (function() {
          const submitBtn = document.querySelector('button[type="submit"]') ||
                           document.querySelector('button:contains("登录")') ||
                           document.querySelector('button:contains("Login")') ||
                           document.querySelector('.login-button');

          if (submitBtn) {
            submitBtn.click();
            return true;
          }

          // 尝试直接提交表单
          const form = document.querySelector('form');
          if (form) {
            form.submit();
            return true;
          }

          return false;
        })()
      `
    });

    // 等待登录响应（最多 10 秒）
    console.log('⏳ 等待登录响应...\n');
    const token = await Promise.race([
      responsePromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('等待响应超时')), 10000)
      )
    ]);

    if (token) {
      console.log(`\n📋 Token: ${token}`);
      console.log(`\n💾 正在更新 .env 文件...`);

      // 更新 .env 文件
      const envPath = join(__dirname, '../.env');
      let envContent = readFileSync(envPath, 'utf8');

      if (envContent.includes('SUNPANEL_API_TOKEN=')) {
        envContent = envContent.replace(/SUNPANEL_API_TOKEN=.*/g, `SUNPANEL_API_TOKEN=${token}`);
      } else {
        envContent += `\nSUNPANEL_API_TOKEN=${token}\n`;
      }

      writeFileSync(envPath, envContent);
      console.log('✅ .env 文件已更新!');
      console.log('\n🔄 请重启服务器: npm start\n');

      return token;
    } else {
      throw new Error('未能捕获 Token');
    }

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error('\n可能的原因:');
    console.error('1. 远程 Chrome 连接失败 - 检查 192.168.9.10:18801 是否可访问');
    console.error('2. SunPanel 登录页面结构变化');
    console.error('3. 用户名或密码错误');
    console.error('4. 网络超时\n');
    console.error('建议: 参考 docs/GET_SUNPANEL_TOKEN.md 手动获取 token\n');
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 已断开 Chrome 连接');
    }
  }
}

// 运行
getTokenViaChrome().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
