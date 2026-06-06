#!/usr/bin/env node
/**
 * SunPanel Token 更新工具
 * 用户手动从浏览器获取 token 后，使用此工具更新 .env 文件
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

function updateEnvToken(token) {
  const envPath = join(__dirname, '../.env');
  let envContent = readFileSync(envPath, 'utf8');

  if (envContent.includes('SUNPANEL_API_TOKEN=')) {
    envContent = envContent.replace(/SUNPANEL_API_TOKEN=.*/g, `SUNPANEL_API_TOKEN=${token}`);
  } else {
    envContent += `\nSUNPANEL_API_TOKEN=${token}\n`;
  }

  writeFileSync(envPath, envContent);
  console.log('\n✅ .env 文件已更新!');
  console.log('🔄 请重启服务器: npm start\n');
}

async function main() {
  console.log('🔐 SunPanel Token 更新工具');
  console.log('==========================\n');
  console.log('请按照以下步骤获取 token:\n');
  console.log('1. 打开浏览器访问: http://192.168.9.2:20001');
  console.log('2. 按 F12 打开开发者工具');
  console.log('3. 切换到 Console (控制台) 标签');
  console.log('4. 粘贴并执行以下代码:\n');
  console.log('   (function() {');
  console.log('     const originalFetch = window.fetch;');
  console.log('     window.fetch = async function(...args) {');
  console.log('       const response = await originalFetch(...args);');
  console.log('       const clone = response.clone();');
  console.log('       try {');
  console.log('         const data = await clone.json();');
  console.log('         if (data.data && data.data.token) {');
  console.log('           console.log("🎉 Token:", data.data.token);');
  console.log('           alert("Token: " + data.data.token);');
  console.log('         }');
  console.log('       } catch(e) {}');
  console.log('       return response;');
  console.log('     };');
  console.log('     alert("✅ 监听器已激活，请退出并重新登录");');
  console.log('   })();\n');
  console.log('5. 退出登录并重新登录');
  console.log('6. Token 会显示在弹窗和控制台中');
  console.log('7. 复制 token 并粘贴到下方\n');
  console.log('─────────────────────────────────────────\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('请输入 token (或按 Ctrl+C 取消): ', (token) => {
    token = token.trim();

    if (!token) {
      console.log('\n❌ Token 不能为空');
      rl.close();
      process.exit(1);
    }

    if (token.length < 10) {
      console.log('\n❌ Token 长度不足，请检查是否完整');
      rl.close();
      process.exit(1);
    }

    console.log(`\n📋 收到 token: ${token.substring(0, 20)}...`);
    updateEnvToken(token);

    rl.close();
  });
}

main().catch(error => {
  console.error('错误:', error.message);
  process.exit(1);
});
