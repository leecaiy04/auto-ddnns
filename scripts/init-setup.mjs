#!/usr/bin/env node
/**
 * 初始化设置脚本
 * 用于首次设置 Central Hub
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('🚀 Central Hub 初始化设置\n');

async function createDirectories() {
  console.log('📁 创建必要目录...');

  const dirs = [
    'data',
    'data/backups',
    'logs',
    'config'
  ];

  for (const dir of dirs) {
    const dirPath = path.join(ROOT_DIR, dir);
    try {
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`  ✅ ${dir}/`);
    } catch (error) {
      console.log(`  ⚠️  ${dir}/ (已存在)`);
    }
  }
}

async function checkEnvFile() {
  console.log('\n🔐 检查环境变量配置...');

  const envPath = path.join(ROOT_DIR, '.env');
  const envTemplatePath = path.join(ROOT_DIR, '.env.template');

  try {
    await fs.access(envPath);
    console.log('  ✅ .env 文件已存在');
  } catch (error) {
    console.log('  ⚠️  .env 文件不存在');
    console.log('  📝 请复制 .env.template 为 .env 并填入配置:');
    console.log('     cp .env.template .env');
    console.log('     vim .env');
  }
}

async function checkConfigFiles() {
  console.log('\n⚙️  检查配置文件...');

  const configs = [
    'config/hub.json',
    'config/devices.json',
    'config/services-registry.json'
  ];

  for (const config of configs) {
    const configPath = path.join(ROOT_DIR, config);
    try {
      await fs.access(configPath);
      console.log(`  ✅ ${config}`);
    } catch (error) {
      console.log(`  ❌ ${config} 不存在`);
    }
  }
}

async function installDependencies() {
  console.log('\n📦 检查依赖...');

  const packageJsonPath = path.join(ROOT_DIR, 'central-hub', 'package.json');

  try {
    await fs.access(packageJsonPath);
    console.log('  ⚠️  请运行以下命令安装依赖:');
    console.log('     npm install');
    console.log('     cd central-hub && npm install');
  } catch (error) {
    console.log('  ❌ package.json 不存在');
  }
}

async function showNextSteps() {
  console.log('\n✨ 初始化完成！\n');
  console.log('📋 下一步操作:\n');
  console.log('1. 配置环境变量:');
  console.log('   cp .env.template .env');
  console.log('   vim .env\n');
  console.log('2. 安装依赖:');
  console.log('   npm install\n');
  console.log('3. 启动服务:');
  console.log('   npm start\n');
  console.log('4. 访问监控界面:');
  console.log('   http://localhost:51000/\n');
}

async function main() {
  await createDirectories();
  await checkEnvFile();
  await checkConfigFiles();
  await installDependencies();
  await showNextSteps();
}

main().catch(error => {
  console.error('❌ 初始化失败:', error);
  process.exit(1);
});
