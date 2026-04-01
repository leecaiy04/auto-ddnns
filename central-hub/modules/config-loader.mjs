#!/usr/bin/env node
/**
 * 配置加载器
 * 优先从 .env 文件读取，如果没有则使用配置文件中的值
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFileAsync } from '../../lib/utils/env-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

/**
 * 加载 .env 文件
 */
async function loadEnv(envPath = null) {
  return loadEnvFileAsync({
    envPath,
    searchPaths: envPath
      ? []
      : [
          path.join(ROOT_DIR, '.env'),
          path.join(ROOT_DIR, 'central-hub', '.env')
        ],
    mutateProcessEnv: false
  });
}

/**
 * 获取配置值（优先从环境变量）
 */
function getConfig(env, configKey, configValue, defaultValue = null) {
  if (env[configKey] !== undefined) {
    return env[configKey];
  }

  if (configValue !== undefined) {
    return configValue;
  }

  return defaultValue;
}

/**
 * 合并配置（env 优先）
 */
export async function loadConfigWithEnv(configPath, envPath = null) {
  const env = await loadEnv(envPath);

  let jsonConfig = {};
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    jsonConfig = JSON.parse(content);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`配置文件读取失败: ${error.message}`);
    }
  }

  return {
    server: {
      port: parseInt(getConfig(env, 'HUB_PORT', jsonConfig.server?.port, 3000), 10),
      host: getConfig(env, 'HUB_HOST', jsonConfig.server?.host, '0.0.0.0'),
      cors: jsonConfig.server?.cors || { enabled: true, origin: '*' }
    },
    router: {
      gateway: getConfig(env, 'ROUTER_GATEWAY', jsonConfig.router?.gateway, '192.168.3.1'),
      checkInterval: parseInt(getConfig(env, 'ROUTER_CHECK_INTERVAL', jsonConfig.router?.checkInterval, 300), 10),
      timeout: jsonConfig.router?.timeout || 10000
    },
    ddns: {
      enabled: jsonConfig.ddns?.enabled !== false,
      scriptPath: getConfig(env, 'DDNS_SCRIPT_PATH', jsonConfig.ddns?.scriptPath),
      domains: jsonConfig.ddns?.domains || []
    },
    lucky: {
      enabled: jsonConfig.lucky?.enabled !== false,
      apiBase: getConfig(env, 'LUCKY_API_BASE', jsonConfig.lucky?.apiBase),
      openToken: getConfig(env, 'LUCKY_OPEN_TOKEN', jsonConfig.lucky?.openToken),
      syncInterval: parseInt(getConfig(env, 'LUCKY_SYNC_INTERVAL', jsonConfig.lucky?.syncInterval, 600), 10)
    },
    sunpanel: {
      enabled: jsonConfig.sunpanel?.enabled !== false,
      apiBase: getConfig(env, 'SUNPANEL_API_BASE', jsonConfig.sunpanel?.apiBase),
      apiToken: getConfig(env, 'SUNPANEL_API_TOKEN', jsonConfig.sunpanel?.apiToken),
      syncOnProxyChange: jsonConfig.sunpanel?.syncOnProxyChange !== false
    },
    state: {
      path: getConfig(env, 'STATE_PATH', jsonConfig.state?.path, 'data/central-hub-state.json'),
      backupPath: getConfig(env, 'STATE_BACKUP_PATH', jsonConfig.state?.backupPath, 'data/backups/'),
      keepHistory: parseInt(getConfig(env, 'STATE_KEEP_HISTORY', jsonConfig.state?.keepHistory, 10), 10),
      backupKeepHistory: parseInt(
        getConfig(env, 'STATE_BACKUP_KEEP_HISTORY', jsonConfig.state?.backupKeepHistory, 1),
        10
      )
    },
    logging: {
      level: getConfig(env, 'LOG_LEVEL', jsonConfig.logging?.level, 'info'),
      file: getConfig(env, 'LOG_FILE', jsonConfig.logging?.file, 'logs/central-hub.log')
    }
  };
}

/**
 * 获取单个环境变量的辅助函数
 */
export function getEnv(key, defaultValue = null) {
  return process.env[key] || defaultValue;
}

/**
 * 检查必需的环境变量
 */
export function checkRequiredEnv(requiredKeys) {
  const missing = [];

  for (const key of requiredKeys) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`缺少必需的环境变量: ${missing.join(', ')}`);
  }
}

export default { loadConfigWithEnv, loadEnv, getConfig, getEnv, checkRequiredEnv };
