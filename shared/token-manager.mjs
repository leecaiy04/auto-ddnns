#!/usr/bin/env node
/**
 * Token 自动管理模块
 * 基于 CDP (Chrome DevTools Protocol) 实现自动登录和 Token 获取
 *
 * 功能：
 * - 自动登录 SunPanel/Lucky
 * - 捕获并保存 Token
 * - Token 有效性验证
 * - Token 自动刷新
 *
 * 依赖：
 * - Chrome 浏览器 + CDP 代理（192.168.9.10:18801）
 * - chrome-remote-interface 包
 */

import CDP from 'chrome-remote-interface';
import { getEnv } from './env-loader.mjs';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const CHROME_HOST = process.env.CDP_HOST || '192.168.9.10';
const CHROME_PORT = parseInt(process.env.CDP_PORT || '18801', 10);

export class TokenManager {
  constructor(config = {}) {
    this.chromeHost = config.chromeHost || CHROME_HOST;
    this.chromePort = config.chromePort || CHROME_PORT;
    this.tokenCachePath = config.tokenCachePath || join(process.cwd(), 'data', 'tokens.json');
    this.tokens = this.loadTokenCache();
  }

  /**
   * 加载本地缓存的 Token
   */
  loadTokenCache() {
    try {
      const content = readFileSync(this.tokenCachePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return {};
    }
  }

  /**
   * 保存 Token 到本地缓存
   */
  saveTokenCache() {
    try {
      writeFileSync(this.tokenCachePath, JSON.stringify(this.tokens, null, 2));
      console.log(`✅ Token 已保存到 ${this.tokenCachePath}`);
    } catch (error) {
      console.error('❌ 保存 Token 失败:', error.message);
    }
  }

  /**
   * 获取 SunPanel Token（自动登录）
   * @param {Object} options - 配置选项
   * @param {string} options.url - SunPanel URL
   * @param {string} options.username - 用户名
   * @param {string} options.password - 密码
   * @param {boolean} options.forceRefresh - 强制刷新
   * @returns {Promise<string>} Token
   */
  async getSunPanelToken(options = {}) {
    const {
      url = getEnv('SUNPANEL_API_BASE', 'http://192.168.9.2:20001').replace('/openapi/v1', ''),
      username = getEnv('SUNPANEL_USERNAME'),
      password = getEnv('SUNPANEL_PASSWORD'),
      forceRefresh = false
    } = options;

    // 检查缓存
    if (!forceRefresh && this.tokens.sunpanel) {
      const isValid = await this.validateSunPanelToken(this.tokens.sunpanel, url);
      if (isValid) {
        console.log('✅ 使用缓存的 SunPanel Token');
        return this.tokens.sunpanel;
      }
    }

    console.log('🤖 自动获取 SunPanel Token');
    console.log(`Chrome CDP: ${this.chromeHost}:${this.chromePort}`);
    console.log(`SunPanel: ${url}`);
    console.log(`用户名: ${username}\n`);

    if (!username || !password) {
      throw new Error('缺少 SUNPANEL_USERNAME 或 SUNPANEL_PASSWORD 环境变量');
    }

    let client;

    try {
      // 连接到 Chrome
      console.log('🔗 连接到远程 Chrome...');
      client = await CDP({ host: this.chromeHost, port: this.chromePort });

      const { Page, Runtime, Network } = client;
      await Page.enable();
      await Runtime.enable();
      await Network.enable();

      console.log('✅ 已连接\n');

      // 导航到 SunPanel
      console.log('🚀 访问 SunPanel...');
      await Page.navigate({ url });
      await Page.loadEventFired();
      await this.sleep(2000);

      // 注入 Token 捕获器
      console.log('📡 注入 Token 监听器...');
      await Page.addScriptToEvaluateOnNewDocument({
        source: this.getTokenCaptureScript()
      });

      // 清除旧的认证数据
      console.log('🧹 清除旧的认证数据...');
      await Runtime.evaluate({
        expression: `
          localStorage.clear();
          sessionStorage.clear();
          console.log('已清除存储');
        `
      });

      // 刷新页面激活监听器
      await Page.reload();
      await Page.loadEventFired();
      await this.sleep(2000);

      // 检查是否在登录页面
      const isLoginPage = await Runtime.evaluate({
        expression: `
          (function() {
            const path = window.location.pathname;
            return path.includes('/login') ||
                   document.querySelector('input[type="password"]') !== null;
          })()
        `
      });

      if (!isLoginPage.result.value) {
        console.log('⚠️  不在登录页面，尝试跳转...');
        await Page.navigate({ url: `${url}/login` });
        await Page.loadEventFired();
        await this.sleep(2000);
      }

      // 自动填写登录表单
      console.log('✍️  填写登录表单...');
      await Runtime.evaluate({
        expression: `
          (function() {
            const usernameInput = document.querySelector('input[type="text"], input[name="username"], input[placeholder*="用户名"]');
            const passwordInput = document.querySelector('input[type="password"]');

            if (usernameInput) {
              usernameInput.value = '${username}';
              usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            if (passwordInput) {
              passwordInput.value = '${password}';
              passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            console.log('已填写表单');
          })()
        `
      });

      await this.sleep(500);

      // 点击登录按钮
      console.log('🔐 提交登录...');
      await Runtime.evaluate({
        expression: `
          (function() {
            const loginButton = document.querySelector('button[type="submit"], button:contains("登录"), .login-btn');
            if (loginButton) {
              loginButton.click();
              console.log('已点击登录按钮');
            }
          })()
        `
      });

      // 等待登录完成并捕获 Token
      console.log('⏳ 等待登录完成...');
      await this.sleep(3000);

      const capturedToken = await Runtime.evaluate({
        expression: `window.__capturedToken || localStorage.getItem('AUTH_TOKEN')`
      });

      let token = capturedToken.result.value;

      // 尝试从 localStorage 解析
      if (token && token.startsWith('{')) {
        try {
          const parsed = JSON.parse(token);
          token = parsed.data?.token || parsed.token || token;
        } catch (e) {
          // 已经是纯 token
        }
      }

      if (!token || token === 'null') {
        throw new Error('未能捕获 Token，登录可能失败');
      }

      console.log(`✅ 成功获取 Token: ${token.substring(0, 20)}...`);

      // 保存到缓存
      this.tokens.sunpanel = token;
      this.tokens.sunpanelExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7天过期
      this.saveTokenCache();

      return token;

    } catch (error) {
      console.error('❌ 获取 Token 失败:', error.message);
      throw error;
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  /**
   * 验证 SunPanel Token 是否有效
   */
  async validateSunPanelToken(token, url) {
    if (!token) return false;

    try {
      const apiUrl = url.replace(/\/$/, '') + '/openapi/v1/common/getSiteInfo';
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Token': token
        }
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取 Token 捕获脚本
   */
  getTokenCaptureScript() {
    return `
      window.__tokenCaptured = false;
      window.__capturedToken = null;

      (function() {
        // 拦截 localStorage.setItem
        const originalSetItem = localStorage.setItem;
        localStorage.setItem = function(key, value) {
          console.log('[TokenManager] localStorage.setItem:', key);

          if (key === 'AUTH_TOKEN' && !window.__tokenCaptured) {
            try {
              const parsed = JSON.parse(value);
              const token = parsed.data?.token || parsed.token;

              if (token && token !== null && token !== '' && token !== 'null') {
                console.log('[TokenManager] 🎉 捕获 Token:', token.substring(0, 20) + '...');
                window.__capturedToken = token;
                window.__tokenCaptured = true;
              }
            } catch (e) {
              // 可能已经是纯字符串 token
              if (value && value !== 'null') {
                window.__capturedToken = value;
                window.__tokenCaptured = true;
              }
            }
          }

          return originalSetItem.apply(this, arguments);
        };

        // 拦截 fetch 请求
        const originalFetch = window.fetch;
        window.fetch = function(url, options) {
          if (options && options.headers && !window.__tokenCaptured) {
            const headers = options.headers;
            ['Authorization', 'Token', 'X-Token'].forEach(key => {
              const value = headers[key] || headers[key.toLowerCase()];
              if (value) {
                window.__capturedToken = value.replace(/^Bearer\\s+/i, '');
                window.__tokenCaptured = true;
              }
            });
          }
          return originalFetch.apply(this, arguments);
        };

        console.log('[TokenManager] ✅ 监听器已激活');
      })();
    `;
  }

  /**
   * 辅助函数：Sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取所有缓存的 Token
   */
  getAllTokens() {
    return { ...this.tokens };
  }

  /**
   * 清除指定服务的 Token
   */
  clearToken(service) {
    delete this.tokens[service];
    delete this.tokens[`${service}Expiry`];
    this.saveTokenCache();
    console.log(`✅ 已清除 ${service} Token`);
  }

  /**
   * 清除所有 Token
   */
  clearAllTokens() {
    this.tokens = {};
    this.saveTokenCache();
    console.log('✅ 已清除所有 Token');
  }
}

// CLI 使用
if (import.meta.url === `file://${process.argv[1]}`) {
  const tokenManager = new TokenManager();
  const command = process.argv[2];

  (async () => {
    switch (command) {
      case 'sunpanel':
        const token = await tokenManager.getSunPanelToken({ forceRefresh: true });
        console.log(`\n📋 Token: ${token}`);
        break;

      case 'list':
        console.log('📋 缓存的 Token:');
        console.log(JSON.stringify(tokenManager.getAllTokens(), null, 2));
        break;

      case 'clear':
        const service = process.argv[3];
        if (service) {
          tokenManager.clearToken(service);
        } else {
          tokenManager.clearAllTokens();
        }
        break;

      default:
        console.log('用法:');
        console.log('  node token-manager.mjs sunpanel    # 获取 SunPanel Token');
        console.log('  node token-manager.mjs list        # 列出所有缓存的 Token');
        console.log('  node token-manager.mjs clear [service]  # 清除 Token');
    }
  })().catch(console.error);
}

export default TokenManager;
