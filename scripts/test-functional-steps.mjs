#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const HUB_URL = `${process.env.HUB_URL || 'http://127.0.0.1:3000'}`.replace(/\/$/, '');
const SPAWN_FLAG = '--spawn';
const HEALTH_PATH = '/api/health';

const STEP_DEFINITIONS = {
  health: {
    label: '健康检查',
    path: '/api/health',
    validate: payload => payload?.status === 'ok'
  },
  status: {
    label: '整体状态',
    path: '/api/status',
    validate: payload => typeof payload?.status === 'string' && payload?.modules && typeof payload.modules === 'object'
  },
  overview: {
    label: 'Dashboard 概览',
    path: '/api/dashboard/overview',
    validate: payload => payload && typeof payload === 'object' && payload.ddns && payload.services
  },
  devices: {
    label: '关键机器列表',
    path: '/api/devices/key-machines',
    validate: payload => Array.isArray(payload)
  },
  ddns: {
    label: 'DDNS 摘要',
    path: '/api/ddns/summary',
    validate: payload => payload?.success === true && payload.summary && typeof payload.summary === 'object'
  },
  schedule: {
    label: 'DDNS 调度状态',
    path: '/api/ddns/schedule',
    validate: payload => payload?.success === true && payload.task && typeof payload.task === 'object'
  },
  services: {
    label: '服务状态',
    path: '/api/services/status',
    validate: payload => payload && typeof payload === 'object'
  },
  inventory: {
    label: '清单导出',
    path: '/api/services/inventory/export',
    validate: payload => payload?.success === true && payload.inventory && typeof payload.inventory === 'object'
  }
};

const STEP_ORDER = ['health', 'status', 'overview', 'devices', 'ddns', 'schedule', 'services', 'inventory'];

function printUsage() {
  console.log('用法: node scripts/test-functional-steps.mjs <step|all|list> [--spawn]');
  console.log(`HUB_URL: ${HUB_URL}`);
  console.log('可用步骤:');
  for (const stepName of STEP_ORDER) {
    const step = STEP_DEFINITIONS[stepName];
    console.log(`  - ${stepName}: ${step.label}`);
  }
}

function summarizePayload(payload) {
  if (Array.isArray(payload)) {
    return `array(${payload.length})`;
  }

  if (payload && typeof payload === 'object') {
    return `keys(${Object.keys(payload).slice(0, 8).join(', ')})`;
  }

  return JSON.stringify(payload);
}

async function fetchJson(apiPath) {
  const url = `${HUB_URL}${apiPath}`;
  const response = await fetch(url);
  const text = await response.text();

  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} - ${url} - ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }

  return payload;
}

async function isHubHealthy() {
  try {
    const payload = await fetchJson(HEALTH_PATH);
    return payload?.status === 'ok';
  } catch {
    return false;
  }
}

async function waitForHubReady(timeoutMs = 20000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isHubHealthy()) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(`等待 Central Hub 启动超时: ${timeoutMs}ms`);
}

function pipeOutput(stream, prefix) {
  stream.on('data', chunk => {
    const text = `${chunk}`.trimEnd();
    if (!text) {
      return;
    }

    for (const line of text.split(/\r?\n/)) {
      console.log(`${prefix}${line}`);
    }
  });
}

async function ensureHubRunning(shouldSpawn) {
  if (await isHubHealthy()) {
    console.log(`ℹ️ 使用已运行的 Central Hub: ${HUB_URL}`);
    return null;
  }

  if (!shouldSpawn) {
    throw new Error(`Central Hub 未运行，请先执行 npm start，或使用 --spawn 自动启动。HUB_URL=${HUB_URL}`);
  }

  console.log('🚀 自动启动 Central Hub...');
  const child = spawn(process.execPath, ['central-hub/server.mjs'], {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  pipeOutput(child.stdout, '[hub] ');
  pipeOutput(child.stderr, '[hub:error] ');

  await waitForHubReady();
  console.log(`✅ Central Hub 已就绪: ${HUB_URL}`);
  return child;
}

async function stopHub(child) {
  if (!child || child.killed) {
    return;
  }

  child.kill('SIGTERM');

  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function runStep(stepName) {
  const step = STEP_DEFINITIONS[stepName];
  if (!step) {
    throw new Error(`未知测试步骤: ${stepName}`);
  }

  console.log(`\n▶ ${stepName} - ${step.label}`);
  const payload = await fetchJson(step.path);

  if (!step.validate(payload)) {
    throw new Error(`步骤校验失败: ${stepName} -> ${summarizePayload(payload)}`);
  }

  console.log(`✅ ${step.label}: ${step.path} -> ${summarizePayload(payload)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const shouldSpawn = args.includes(SPAWN_FLAG);
  const filteredArgs = args.filter(arg => arg !== SPAWN_FLAG);
  const target = filteredArgs[0] || 'all';

  if (target === 'list' || target === '--help' || target === '-h') {
    printUsage();
    return;
  }

  const steps = target === 'all' ? STEP_ORDER : [target];
  const child = await ensureHubRunning(shouldSpawn);

  try {
    for (const stepName of steps) {
      await runStep(stepName);
    }

    console.log(`\n🎉 完成 ${steps.length} 个测试步骤`);
  } finally {
    await stopHub(child);
  }
}

main().catch(error => {
  console.error(`\n❌ 测试失败: ${error.message}`);
  process.exit(1);
});
