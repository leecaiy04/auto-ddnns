#!/usr/bin/env node
/**
 * SunPanel Token 自动获取工具
 * 尝试多种方式自动登录并获取 token
 */

import { getEnv } from '../shared/env-loader.mjs';

const SUNPANEL_BASE = getEnv('SUNPANEL_API_BASE', 'http://192.168.9.2:20001').replace('/openapi/v1', '');
const USERNAME = getEnv('SUNPANEL_USERNAME', '');
const PASSWORD = getEnv('SUNPANEL_PASSWORD', '');

async function tryLogin(endpoint, body, contentType = 'application/json') {
  const url = `${SUNPANEL_BASE}${endpoint}`;
  console.log(`\n🔍 尝试: ${url}`);
  console.log(`   Content-Type: ${contentType}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: contentType === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString()
    });

    const contentTypeHeader = response.headers.get('content-type');
    console.log(`   响应状态: ${response.status}`);
    console.log(`   响应类型: ${contentTypeHeader}`);

    if (contentTypeHeader && contentTypeHeader.includes('application/json')) {
      const data = await response.json();
      console.log(`   响应数据:`, JSON.stringify(data, null, 2));

      if (data.code === 0 && data.data && data.data.token) {
        return { success: true, token: data.data.token };
      }

      return { success: false, error: data.msg || 'No token in response' };
    } else {
      const text = await response.text();
      console.log(`   响应: HTML (${text.length} bytes)`);
      return { success: false, error: 'Response is HTML, not JSON' };
    }
  } catch (error) {
    console.log(`   ❌ 错误: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🔐 SunPanel Token 自动获取工具');
  console.log('================================\n');
  console.log(`Base URL: ${SUNPANEL_BASE}`);
  console.log(`Username: ${USERNAME}`);
  console.log(`Password: ${PASSWORD ? '***' : '(未设置)'}\n`);

  if (!USERNAME || !PASSWORD) {
    console.error('❌ 错误: 请在 .env 文件中设置 SUNPANEL_USERNAME 和 SUNPANEL_PASSWORD');
    process.exit(1);
  }

  const attempts = [
    // 尝试 1: /api/login/account (JSON)
    {
      endpoint: '/api/login/account',
      body: { username: USERNAME, password: PASSWORD },
      contentType: 'application/json'
    },
    // 尝试 2: /api/login/account (form)
    {
      endpoint: '/api/login/account',
      body: { username: USERNAME, password: PASSWORD },
      contentType: 'application/x-www-form-urlencoded'
    },
    // 尝试 3: /api/user/login (JSON)
    {
      endpoint: '/api/user/login',
      body: { username: USERNAME, password: PASSWORD },
      contentType: 'application/json'
    },
    // 尝试 4: /openapi/v1/login (JSON)
    {
      endpoint: '/openapi/v1/login',
      body: { username: USERNAME, password: PASSWORD },
      contentType: 'application/json'
    },
    // 尝试 5: /api/auth/login (JSON)
    {
      endpoint: '/api/auth/login',
      body: { username: USERNAME, password: PASSWORD },
      contentType: 'application/json'
    }
  ];

  for (const attempt of attempts) {
    const result = await tryLogin(attempt.endpoint, attempt.body, attempt.contentType);

    if (result.success) {
      console.log('\n✅ 成功获取 Token!');
      console.log('Token:', result.token);
      console.log('\n正在更新 .env 文件...');

      // 更新 .env 文件
      const { readFileSync, writeFileSync } = await import('fs');
      const envPath = new URL('../../.env', import.meta.url).pathname;
      let envContent = readFileSync(envPath, 'utf8');

      if (envContent.includes('SUNPANEL_API_TOKEN=')) {
        envContent = envContent.replace(/SUNPANEL_API_TOKEN=.*/g, `SUNPANEL_API_TOKEN=${result.token}`);
      } else {
        envContent += `\nSUNPANEL_API_TOKEN=${result.token}\n`;
      }

      writeFileSync(envPath, envContent);
      console.log('✅ .env 文件已更新!');
      console.log('\n请重启服务器: npm start');
      process.exit(0);
    }
  }

  console.log('\n❌ 所有登录尝试均失败');
  console.log('\n建议:');
  console.log('1. 检查用户名和密码是否正确');
  console.log('2. 访问 http://192.168.9.2:20001 确认可以正常登录');
  console.log('3. 参考 docs/GET_SUNPANEL_TOKEN.md 手动获取 token');
  process.exit(1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
