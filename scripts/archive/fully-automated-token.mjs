#!/usr/bin/env node
/**
 * 使用 CDP 完全自动化：强制登出、重新登录、捕获 token
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

async function fullyAutomatedTokenCapture() {
  console.log('🤖 全自动获取 SunPanel Token');
  console.log('============================\n');
  console.log(`Chrome: ${CHROME_HOST}:${CHROME_PORT}`);
  console.log(`SunPanel: ${SUNPANEL_URL}`);
  console.log(`用户名: ${USERNAME}\n`);

  if (!USERNAME || !PASSWORD) {
    console.error('❌ 请在 .env 设置 SUNPANEL_USERNAME 和 SUNPANEL_PASSWORD');
    process.exit(1);
  }

  let client;

  try {
    console.log('🔗 连接到远程 Chrome...');
    client = await CDP({ host: CHROME_HOST, port: CHROME_PORT });

    const { Page, Runtime, Network } = client;
    await Page.enable();
    await Runtime.enable();
    await Network.enable();

    console.log('✅ 已连接\n');

    // 第一步：注入 localStorage 监听器（在任何页面操作之前）
    console.log('📡 注入全局 token 监听器...');

    // 先导航到目标页面
    await Page.navigate({ url: SUNPANEL_URL });
    await Page.loadEventFired();
    await new Promise(resolve => setTimeout(resolve, 1500));

    // 注入监听器
    await Page.addScriptToEvaluateOnNewDocument({
      source: `
        window.__tokenCaptured = false;
        window.__capturedToken = null;

        (function() {
          const originalSetItem = localStorage.setItem;
          localStorage.setItem = function(key, value) {
            console.log('[监听器] localStorage.setItem:', key);

            if (key === 'AUTH_TOKEN' && !window.__tokenCaptured) {
              try {
                const parsed = JSON.parse(value);
                const token = parsed.data?.token;

                if (token && token !== null && token !== '' && token !== 'null') {
                  console.log('[监听器] 🎉 捕获 token:', token);
                  window.__capturedToken = token;
                  window.__tokenCaptured = true;
                }
              } catch (e) {
                console.log('[监听器] 解析失败:', e.message);
              }
            }

            return originalSetItem.apply(this, arguments);
          };

          console.log('[监听器] ✅ 已激活');
        })();
      `
    });

    console.log('✅ 监听器已注入\n');

    // 第二步：彻底清除所有认证数据
    console.log('🧹 清除所有认证数据...');

    await Runtime.evaluate({
      expression: `
        (function() {
          localStorage.clear();
          sessionStorage.clear();
          console.log('已清除所有存储');
        })()
      `
    });

    await Network.clearBrowserCookies();
    await Network.clearBrowserCache();

    console.log('✅ 数据已清除\n');

    // 第三步：尝试访问登录页面的各种可能路径
    console.log('🔄 尝试访问登录页面...');

    const loginPaths = [
      '/login',
      '/auth/login',
      '/user/login',
      '/#/login',
      '/index.html#/login'
    ];

    let loginPageFound = false;

    for (const path of loginPaths) {
      const loginUrl = `${SUNPANEL_URL}${path}`;
      console.log(`   尝试: ${loginUrl}`);

      await Page.navigate({ url: loginUrl });
      await Page.loadEventFired();
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 检查是否有登录表单
      const hasForm = await Runtime.evaluate({
        expression: `
          (function() {
            const inputs = Array.from(document.querySelectorAll('input')).filter(i => i.offsetParent !== null);
            const hasPassword = inputs.some(i => i.type === 'password');
            return hasPassword && inputs.length >= 2;
          })()
        `,
        returnByValue: true
      });

      if (hasForm.result.value) {
        console.log(`   ✅ 找到登录表单: ${loginUrl}\n`);
        loginPageFound = true;
        break;
      }
    }

    if (!loginPageFound) {
      console.log('   未找到专门的登录页面\n');
      console.log('🔄 刷新主页...');
      await Page.navigate({ url: SUNPANEL_URL });
      await Page.loadEventFired();
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('✅ 页面已加载\n');
    }

    // 第四步：检查页面状态
    console.log('🔍 检查页面状态...');
    const pageState = await Runtime.evaluate({
      expression: `
        (function() {
          const inputs = Array.from(document.querySelectorAll('input'));
          return {
            url: window.location.href,
            title: document.title,
            inputCount: inputs.length,
            inputs: inputs.map(i => ({
              type: i.type,
              name: i.name,
              placeholder: i.placeholder,
              id: i.id,
              visible: i.offsetParent !== null
            })).filter(i => i.visible),
            bodyText: document.body.innerText.substring(0, 300)
          };
        })()
      `,
      returnByValue: true
    });

    console.log(`   URL: ${pageState.result.value.url}`);
    console.log(`   标题: ${pageState.result.value.title}`);
    console.log(`   可见输入框: ${pageState.result.value.inputs.length}`);

    if (pageState.result.value.inputs.length > 0) {
      console.log('   输入框详情:');
      pageState.result.value.inputs.forEach((inp, i) => {
        console.log(`     [${i}] type=${inp.type}, placeholder="${inp.placeholder}"`);
      });
    }
    console.log();

    // 第五步：等待登录表单出现（最多等 10 秒）
    console.log('⏳ 等待登录表单出现...');
    let loginFormFound = false;

    for (let attempt = 0; attempt < 20; attempt++) {
      const checkForm = await Runtime.evaluate({
        expression: `
          (function() {
            const visibleInputs = Array.from(document.querySelectorAll('input')).filter(i => i.offsetParent !== null);
            const usernameInput = visibleInputs.find(i =>
              i.type === 'text' ||
              i.name === 'username' ||
              i.placeholder?.includes('用户') ||
              i.placeholder?.includes('账号')
            );
            const passwordInput = visibleInputs.find(i => i.type === 'password');

            return {
              found: !!(usernameInput && passwordInput),
              usernameInput: usernameInput ? {
                type: usernameInput.type,
                name: usernameInput.name,
                placeholder: usernameInput.placeholder
              } : null,
              passwordInput: passwordInput ? {
                type: passwordInput.type,
                name: passwordInput.name
              } : null
            };
          })()
        `,
        returnByValue: true
      });

      if (checkForm.result.value.found) {
        loginFormFound = true;
        console.log('✅ 找到登录表单\n');
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!loginFormFound) {
      console.log('❌ 未找到登录表单\n');
      console.log('页面内容预览:');
      console.log(pageState.result.value.bodyText);
      console.log('\n可能原因:');
      console.log('1. 页面加载慢，需要更长时间');
      console.log('2. SunPanel 使用了特殊的登录机制');
      console.log('3. 清除数据后需要手动刷新\n');
      process.exit(1);
    }

    // 第六步：填写登录表单
    console.log('📝 填写登录信息...');
    await Runtime.evaluate({
      expression: `
        (function() {
          const visibleInputs = Array.from(document.querySelectorAll('input')).filter(i => i.offsetParent !== null);

          const usernameInput = visibleInputs.find(i =>
            i.type === 'text' ||
            i.name === 'username' ||
            i.placeholder?.includes('用户') ||
            i.placeholder?.includes('账号')
          );

          const passwordInput = visibleInputs.find(i => i.type === 'password');

          if (usernameInput) {
            usernameInput.value = '${USERNAME}';
            usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
            usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('[表单] 已填写用户名');
          }

          if (passwordInput) {
            passwordInput.value = '${PASSWORD}';
            passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
            passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('[表单] 已填写密码');
          }

          return {
            username: !!usernameInput,
            password: !!passwordInput
          };
        })()
      `,
      returnByValue: true
    });

    console.log('✅ 表单已填写\n');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 第七步：提交登录
    console.log('🔐 提交登录...');
    await Runtime.evaluate({
      expression: `
        (function() {
          const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
          const submitBtn = buttons.find(b =>
            b.type === 'submit' ||
            b.textContent.includes('登录') ||
            b.textContent.includes('Login') ||
            b.className.includes('login')
          );

          if (submitBtn) {
            console.log('[表单] 点击提交按钮');
            submitBtn.click();
            return true;
          }

          const form = document.querySelector('form');
          if (form) {
            console.log('[表单] 提交表单');
            form.submit();
            return true;
          }

          console.log('[表单] 未找到提交方式');
          return false;
        })()
      `
    });

    console.log('⏳ 等待登录完成...\n');

    // 第八步：等待 token 被捕获（最多 15 秒）
    let capturedToken = null;

    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));

      const tokenCheck = await Runtime.evaluate({
        expression: `
          (function() {
            return {
              captured: window.__tokenCaptured,
              token: window.__capturedToken
            };
          })()
        `,
        returnByValue: true
      });

      if (tokenCheck.result.value.captured && tokenCheck.result.value.token) {
        capturedToken = tokenCheck.result.value.token;
        break;
      }

      // 也检查 localStorage
      const storageCheck = await Runtime.evaluate({
        expression: `
          (function() {
            try {
              const authToken = localStorage.getItem('AUTH_TOKEN');
              if (authToken) {
                const parsed = JSON.parse(authToken);
                return parsed.data?.token;
              }
            } catch (e) {}
            return null;
          })()
        `,
        returnByValue: true
      });

      if (storageCheck.result.value && storageCheck.result.value !== 'null') {
        capturedToken = storageCheck.result.value;
        break;
      }

      if (i % 4 === 0) {
        process.stdout.write('.');
      }
    }

    console.log('\n');

    if (!capturedToken) {
      console.log('❌ 登录超时，未捕获到 token\n');

      // 检查登录是否失败
      const errorCheck = await Runtime.evaluate({
        expression: `
          (function() {
            const bodyText = document.body.innerText;
            return {
              hasError: bodyText.includes('错误') || bodyText.includes('失败') || bodyText.includes('error'),
              bodyText: bodyText.substring(0, 500)
            };
          })()
        `,
        returnByValue: true
      });

      console.log('页面状态:');
      console.log(errorCheck.result.value.bodyText);
      console.log('\n可能原因:');
      console.log('1. 用户名或密码错误');
      console.log('2. 登录请求被拦截');
      console.log('3. 需要验证码');
      console.log('4. 网络问题\n');

      process.exit(1);
    }

    // 第九步：验证并保存 token
    console.log('✅ 成功捕获 token!');
    console.log(`📋 Token: ${capturedToken}\n`);

    console.log('💾 更新 .env 文件...');
    const envPath = join(__dirname, '../.env');
    let envContent = readFileSync(envPath, 'utf8');

    if (envContent.includes('SUNPANEL_API_TOKEN=')) {
      envContent = envContent.replace(/SUNPANEL_API_TOKEN=.*/g, `SUNPANEL_API_TOKEN=${capturedToken}`);
    } else {
      envContent += `\nSUNPANEL_API_TOKEN=${capturedToken}\n`;
    }

    writeFileSync(envPath, envContent);
    console.log('✅ .env 文件已更新!\n');

    console.log('🔄 请重启服务器以应用新 token:');
    console.log('   npm start');
    console.log('   或');
    console.log('   pm2 restart auto-ddnns\n');

    return capturedToken;

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    if (error.stack) {
      console.error('\n堆栈跟踪:', error.stack);
    }
    process.exit(1);
  } finally {
    if (client) {
      try {
        await client.close();
        console.log('🔌 已断开 Chrome 连接');
      } catch (e) {
        // 忽略关闭错误
      }
    }
  }
}

fullyAutomatedTokenCapture().catch(error => {
  console.error('Fatal:', error);
  process.exit(1);
});
