#!/usr/bin/env node
/**
 * 通过 JavaScript 注入拦截所有请求头来自动获取 token
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
  console.log('🔍 自动捕获 SunPanel Token (JavaScript 注入方式)');
  console.log('===============================================\n');

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

    console.log('✅ 页面已加载\n');

    // 注入全局拦截器
    console.log('💉 注入请求拦截器...');
    await Runtime.evaluate({
      expression: `
        (function() {
          window.__capturedToken = null;

          // 拦截 XMLHttpRequest
          const originalXHROpen = XMLHttpRequest.prototype.open;
          const originalXHRSend = XMLHttpRequest.prototype.send;
          const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

          XMLHttpRequest.prototype.open = function(...args) {
            this.__headers = {};
            return originalXHROpen.apply(this, args);
          };

          XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
            this.__headers = this.__headers || {};
            this.__headers[name] = value;

            // 捕获所有可能的 token 头
            const lowerName = name.toLowerCase();
            if (lowerName.includes('token') || lowerName.includes('auth') || lowerName === 'authorization') {
              console.log('[XHR] 捕获请求头:', name, '=', value);
              if (!window.__capturedToken) {
                window.__capturedToken = value.replace(/^Bearer\\s+/i, '');
              }
            }

            return originalXHRSetRequestHeader.apply(this, arguments);
          };

          // 拦截 fetch
          const originalFetch = window.fetch;
          window.fetch = function(url, options) {
            if (options && options.headers) {
              const headers = options.headers;
              if (headers instanceof Headers) {
                headers.forEach((value, key) => {
                  const lowerKey = key.toLowerCase();
                  if (lowerKey.includes('token') || lowerKey.includes('auth') || lowerKey === 'authorization') {
                    console.log('[Fetch] 捕获请求头:', key, '=', value);
                    if (!window.__capturedToken) {
                      window.__capturedToken = value.replace(/^Bearer\\s+/i, '');
                    }
                  }
                });
              } else if (typeof headers === 'object') {
                Object.entries(headers).forEach(([key, value]) => {
                  const lowerKey = key.toLowerCase();
                  if (lowerKey.includes('token') || lowerKey.includes('auth') || lowerKey === 'authorization') {
                    console.log('[Fetch] 捕获请求头:', key, '=', value);
                    if (!window.__capturedToken) {
                      window.__capturedToken = value.replace(/^Bearer\\s+/i, '');
                    }
                  }
                });
              }
            }
            return originalFetch.apply(this, arguments);
          };

          console.log('✅ 拦截器已激活');
        })()
      `
    });

    console.log('✅ 拦截器已注入\n');

    // 触发一些 API 请求
    console.log('📡 触发 API 请求...');
    await Runtime.evaluate({
      expression: `
        (async function() {
          // 触发多个 API 请求
          const endpoints = [
            '/api/user/getAuthInfo',
            '/api/panel/userConfig/get',
            '/api/panel/itemIcon/getListAllGroup'
          ];

          for (const endpoint of endpoints) {
            try {
              await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              await new Promise(r => setTimeout(r, 100));
            } catch (e) {
              console.log('请求失败:', endpoint, e.message);
            }
          }
        })()
      `,
      awaitPromise: true
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 检查是否捕获到 token
    console.log('🔍 检查捕获结果...\n');
    const result = await Runtime.evaluate({
      expression: 'window.__capturedToken',
      returnByValue: true
    });

    const token = result.result.value;

    if (token) {
      console.log(`✅ 成功捕获 token!`);
      console.log(`📋 Token: ${token}\n`);

      // 更新 .env
      console.log('💾 更新 .env 文件...');
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
      console.log('❌ 未能捕获到 token');
      console.log('\n可能原因:');
      console.log('1. Token 不在请求头中');
      console.log('2. 使用了其他认证方式（如 cookies）');
      console.log('3. 需要更多时间等待请求\n');

      // 打印浏览器控制台日志
      console.log('💡 尝试手动检查: 访问 http://192.168.9.10:18801');
      console.log('   打开浏览器开发者工具，查看 Console 标签\n');

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
