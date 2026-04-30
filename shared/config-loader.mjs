#!/usr/bin/env node
/**
 * 配置加载器
 * 优先从 .env 文件读取，如果没有则使用配置文件中的值。
 * 输出结构与 central-hub/server.mjs 当前期望的 config 结构保持一致。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFileAsync } from './env-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

async function loadEnv(envPath = null) {
  const fileEnv = await loadEnvFileAsync({
    envPath,
    searchPaths: envPath
      ? []
      : [
          path.join(ROOT_DIR, '.env'),
          path.join(ROOT_DIR, 'central-hub', '.env')
        ],
    mutateProcessEnv: false
  });

  if (envPath) {
    return fileEnv;
  }

  return {
    ...fileEnv,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value !== undefined)
    )
  };
}

function getConfig(env, configKeys, configValue, defaultValue = null) {
  const keys = Array.isArray(configKeys) ? configKeys : [configKeys];

  for (const key of keys) {
    if (key && env[key] !== undefined) {
      return env[key];
    }
  }

  if (configValue !== undefined) {
    return configValue;
  }

  return defaultValue;
}

function toInt(value, defaultValue) {
  const parsed = Number.parseInt(`${value ?? ''}`, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function toBool(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function getModuleConfig(jsonConfig, moduleName) {
  return jsonConfig.modules?.[moduleName] ?? jsonConfig[moduleName] ?? {};
}

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

  const serverConfig = jsonConfig.server ?? {};
  const stateConfig = jsonConfig.state ?? {};
  const loggingConfig = jsonConfig.logging ?? {};
  const coordinatorConfig = getModuleConfig(jsonConfig, 'coordinator');
  const deviceMonitorConfig = getModuleConfig(jsonConfig, 'deviceMonitor');
  const serviceRegistryConfig = getModuleConfig(jsonConfig, 'serviceRegistry');
  const ddnsConfig = getModuleConfig(jsonConfig, 'ddns');
  const luckyConfig = getModuleConfig(jsonConfig, 'lucky');
  const sunpanelConfig = getModuleConfig(jsonConfig, 'sunpanel');
  const cloudflareConfig = getModuleConfig(jsonConfig, 'cloudflare');
  const legacyRouterConfig = jsonConfig.router ?? {};
  const routerConfig = deviceMonitorConfig.router ?? {};

  const resolvedRouter = {
    host: getConfig(
      env,
      ['ROUTER_HOST', 'ROUTER_IP'],
      routerConfig.host ?? legacyRouterConfig.host ?? legacyRouterConfig.gateway,
      '192.168.9.1'
    ),
    port: toInt(
      getConfig(env, 'ROUTER_PORT', routerConfig.port ?? legacyRouterConfig.port, 22),
      22
    ),
    username: getConfig(
      env,
      ['ROUTER_USERNAME', 'ROUTER_USER'],
      routerConfig.username ?? legacyRouterConfig.username,
      'root'
    ),
    password: getConfig(
      env,
      ['ROUTER_PASSWORD', 'ROUTER_PASS'],
      routerConfig.password ?? legacyRouterConfig.password,
      ''
    ),
    timeout: toInt(
      getConfig(env, 'ROUTER_TIMEOUT', routerConfig.timeout ?? legacyRouterConfig.timeout, 10000),
      10000
    )
  };

  const modules = {
    coordinator: {
      enabled: toBool(coordinatorConfig.enabled, true),
      schedule: coordinatorConfig.schedule ?? {}
    },
    deviceMonitor: {
      enabled: toBool(deviceMonitorConfig.enabled, true),
      checkInterval: toInt(
        getConfig(
          env,
          'ROUTER_CHECK_INTERVAL',
          deviceMonitorConfig.checkInterval ?? legacyRouterConfig.checkInterval,
          600
        ),
        600
      ),
      devices: deviceMonitorConfig.devices ?? [],
      router: resolvedRouter
    },
    serviceRegistry: {
      enabled: toBool(serviceRegistryConfig.enabled, true),
      allowedDevices: serviceRegistryConfig.allowedDevices ?? serviceRegistryConfig.deviceIds ?? []
    },
    ddns: {
      ...ddnsConfig,
      enabled: toBool(getConfig(env, 'DDNS_ENABLED', ddnsConfig.enabled, true), true),
      luckyDdns: {
        enabled: toBool(ddnsConfig.luckyDdns?.enabled, true),
        devices: ddnsConfig.luckyDdns?.devices || [],
        domains: ddnsConfig.luckyDdns?.domains || [],
        intervals: toInt(ddnsConfig.luckyDdns?.intervals, 36),
        forceInterval: toInt(ddnsConfig.luckyDdns?.forceInterval, 3600)
      }
    },
    lucky: {
      ...luckyConfig,
      enabled: toBool(getConfig(env, 'LUCKY_ENABLED', luckyConfig.enabled, true), true),
      apiBase: getConfig(env, 'LUCKY_API_BASE', luckyConfig.apiBase),
      openToken: getConfig(env, 'LUCKY_OPEN_TOKEN', luckyConfig.openToken, ''),
      adminToken: getConfig(env, 'LUCKY_ADMIN_TOKEN', luckyConfig.adminToken, ''),
      httpsPort: toInt(getConfig(env, 'LUCKY_HTTPS_PORT', luckyConfig.httpsPort, 55000), 55000),
      autoSync: toBool(getConfig(env, 'LUCKY_AUTO_SYNC', luckyConfig.autoSync, true), true),
      autoCreateProxy: toBool(
        getConfig(env, 'LUCKY_AUTO_CREATE_PROXY', luckyConfig.autoCreateProxy, true),
        true
      ),
      ddnsConfig: {
        enabled: toBool(ddnsConfig.luckyDdns?.enabled, true),
        devices: ddnsConfig.luckyDdns?.devices || [],
        domains: ddnsConfig.luckyDdns?.domains || [],
        intervals: toInt(ddnsConfig.luckyDdns?.intervals, 36),
        forceInterval: toInt(ddnsConfig.luckyDdns?.forceInterval, 3600)
      }
    },
    sunpanel: {
      ...sunpanelConfig,
      enabled: toBool(getConfig(env, 'SUNPANEL_ENABLED', sunpanelConfig.enabled, true), true),
      apiBase: getConfig(env, 'SUNPANEL_API_BASE', sunpanelConfig.apiBase),
      apiToken: getConfig(env, 'SUNPANEL_API_TOKEN', sunpanelConfig.apiToken, ''),
      autoSync: toBool(getConfig(env, 'SUNPANEL_AUTO_SYNC', sunpanelConfig.autoSync, true), true),
      autoCreateGroups: toBool(
        getConfig(env, 'SUNPANEL_AUTO_CREATE_GROUPS', sunpanelConfig.autoCreateGroups, true),
        true
      )
    },
    cloudflare: {
      ...cloudflareConfig,
      enabled: toBool(getConfig(env, 'CLOUDFLARE_ENABLED', cloudflareConfig.enabled, true), true),
      apiToken: getConfig(env, 'CF_API_TOKEN', cloudflareConfig.apiToken, ''),
      zoneId: getConfig(env, 'CF_ZONE_ID', cloudflareConfig.zoneId, ''),
      domain: getConfig(env, 'CF_DOMAIN', cloudflareConfig.domain, ''),
      proxied: toBool(getConfig(env, 'CF_PROXIED', cloudflareConfig.proxied, true), true),
      autoSync: toBool(getConfig(env, 'CLOUDFLARE_AUTO_SYNC', cloudflareConfig.autoSync, true), true)
    }
  };

  return {
    server: {
      port: toInt(getConfig(env, 'HUB_PORT', serverConfig.port, 51000), 51000),
      host: getConfig(env, 'HUB_HOST', serverConfig.host, '0.0.0.0'),
      cors: serverConfig.cors || { enabled: true, origin: '*' }
    },
    modules,
    state: {
      path: getConfig(env, 'STATE_PATH', stateConfig.path, 'data/hub-state.json'),
      backupPath: getConfig(env, 'STATE_BACKUP_PATH', stateConfig.backupPath, 'data/backups/'),
      keepHistory: toInt(getConfig(env, 'STATE_KEEP_HISTORY', stateConfig.keepHistory, 10), 10),
      backupKeepHistory: toInt(
        getConfig(env, 'STATE_BACKUP_KEEP_HISTORY', stateConfig.backupKeepHistory, 1),
        1
      )
    },
    logging: {
      level: getConfig(env, 'LOG_LEVEL', loggingConfig.level, 'info'),
      file: getConfig(env, 'LOG_FILE', loggingConfig.file, 'logs/hub.log')
    },
    router: {
      gateway: resolvedRouter.host,
      host: resolvedRouter.host,
      port: resolvedRouter.port,
      username: resolvedRouter.username,
      password: resolvedRouter.password,
      timeout: resolvedRouter.timeout,
      checkInterval: modules.deviceMonitor.checkInterval
    },
    ddns: modules.ddns,
    lucky: modules.lucky,
    sunpanel: modules.sunpanel,
    cloudflare: modules.cloudflare
  };
}

export function getEnv(key, defaultValue = null) {
  return process.env[key] || defaultValue;
}

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
