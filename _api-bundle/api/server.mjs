#!/usr/bin/env node
/**
 * Central Hub Service - 中枢服务 (v2.0)
 *
 * 统一的网络基础设施管理服务
 * - 设备监控（IPv6地址获取）
 * - DDNS 自动更新
 * - 服务清单管理
 * - Lucky 反向代理自动化（50000端口）
 * - SunPanel 卡片自动化
 * - Cloudflare DNS 管理
 * - Web 监控界面
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadEnvFileAsync, getEnv } from '../lib/utils/env-loader.mjs';
import { loadConfigWithEnv } from './modules/config-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DOMAIN = 'leecaiy.shop';
const LOCAL_HOSTS_FOR_PROBE = ['127.0.0.1', 'localhost'];

function getManagedDomain() {
  return getEnv('ALIYUN_DOMAIN', DEFAULT_DOMAIN).trim() || DEFAULT_DOMAIN;
}

function createHealthProbeUrls(host, port) {
  const normalizedHost = `${host || ''}`.trim();
  const candidates = [];

  if (!normalizedHost || normalizedHost === '0.0.0.0' || normalizedHost === '::') {
    candidates.push(...LOCAL_HOSTS_FOR_PROBE);
  } else {
    candidates.push(normalizedHost);
  }

  return [...new Set(candidates)].map(candidate => `http://${candidate}:${port}/api/health`);
}

async function isHubAlreadyRunning(host, port) {
  const probeUrls = createHealthProbeUrls(host, port);

  for (const url of probeUrls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      if (payload?.status === 'ok') {
        return { running: true, url };
      }
    } catch {
      // ignore probe failures and continue checking other local URLs
    }
  }

  return { running: false, url: null };
}

function applyRuntimeConfigOverrides(config) {
  const managedDomain = getManagedDomain();

  if (config?.modules?.ddns?.domains) {
    config.modules.ddns.domains = {
      ipv4: [managedDomain, `*.${managedDomain}`],
      ipv6: ['10', '200', '201', '254'].map(device => `${device}.v6.${managedDomain}`)
    };

    // 保持 extraDomains 配置（用于 222869.xyz 等额外域名）
    // extraDomains 在 hub.json 中静态配置，不做覆盖
  }

  if (config?.modules?.lucky) {
    const luckyInstances = [];
    if (process.env.LUCKY_API_BASE) {
      luckyInstances.push({
        apiBase: process.env.LUCKY_API_BASE,
        token: process.env.LUCKY_TOKEN || process.env.LUCKY_API_TOKEN,
        username: process.env.LUCKY_USERNAME,
        password: process.env.LUCKY_PASSWORD
      });
    } else {
      luckyInstances.push({
        apiBase: `https://lucky.${managedDomain}:50000/666`
      });
    }
    if (process.env.LUCKY_BACKUP_API_BASE) {
      luckyInstances.push({
        apiBase: process.env.LUCKY_BACKUP_API_BASE,
        token: process.env.LUCKY_BACKUP_TOKEN || process.env.LUCKY_BACKUP_API_TOKEN,
        username: process.env.LUCKY_BACKUP_USERNAME,
        password: process.env.LUCKY_BACKUP_PASSWORD
      });
    }
    config.modules.lucky.instances = luckyInstances;
  }

  if (config?.modules?.sunpanel) {
    const sunInstances = [];
    if (process.env.SUNPANEL_API_BASE) {
      sunInstances.push({
        apiBase: process.env.SUNPANEL_API_BASE,
        apiToken: process.env.SUNPANEL_API_TOKEN
      });
    }
    if (process.env.SUNPANEL_BACKUP_API_BASE) {
      sunInstances.push({
        apiBase: process.env.SUNPANEL_BACKUP_API_BASE,
        apiToken: process.env.SUNPANEL_BACKUP_API_TOKEN
      });
    }
    config.modules.sunpanel.instances = sunInstances;
  }

  return config;
}

// ==================== 加载环境变量 ====================

async function loadEnvFile() {
  return await loadEnvFileAsync();
}

// 导入新模块
import { DeviceMonitor } from './modules/device-monitor.mjs';
import { ServiceRegistry } from './modules/service-registry.mjs';
import { LuckyManager } from './modules/lucky-manager.mjs';
import { CloudflareManager } from './modules/cloudflare-manager.mjs';
import { Coordinator } from './modules/coordinator.mjs';
import { StateManager } from './modules/state-manager.mjs';
import { DDNSController } from './modules/ddns-controller.mjs';
import { ChangelogManager } from './modules/changelog-manager.mjs';

// 导入路由
import { dashboardRoutes } from './routes/dashboard.mjs';
import { deviceRoutes } from './routes/devices.mjs';
import { serviceRoutes } from './routes/services.mjs';
import ddnsRoutes from './routes/ddns.mjs';
import proxyRoutes from './routes/proxy.mjs';
import cloudflareRoutes from './routes/cloudflare.mjs';
import bookmarkRoutes from './routes/bookmarks.mjs';
import changelogRoutes from './routes/changelog.mjs';

class CentralHub {
  constructor(configPath) {
    this.config = null;
    this.configPath = configPath;
    this.app = express();
    this.server = null;
    this.modules = {};
    this.stateManager = null;
    this.coordinator = null;
    this.startTime = Date.now();

    this.setupMiddleware();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static(path.join(__dirname, 'public')));

    // 请求日志
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  async loadConfig() {
    try {
      this.config = applyRuntimeConfigOverrides(await loadConfigWithEnv(this.configPath));
      console.log('✅ 配置加载成功');
      return this.config;
    } catch (error) {
      console.error('❌ 配置加载失败:', error.message);
      throw error;
    }
  }

  async initModules() {
    console.log('🔧 初始化模块...');

    // 状态管理器
    this.stateManager = new StateManager(this.config.state);
    await this.stateManager.init();

    // 变更日志管理器
    this.changelogManager = new ChangelogManager();
    await this.changelogManager.init();
    
    // Inject root config for routers
    this.modules.config = this.config;
    this.modules.stateManager = this.stateManager;
    this.modules.changelogManager = this.changelogManager;

    // 设备监控模块
    if (this.config.modules.deviceMonitor?.enabled) {
      this.modules.deviceMonitor = new DeviceMonitor(
        this.config.modules.deviceMonitor,
        this.stateManager
      );
    }

    // 服务清单管理模块
    if (this.config.modules.serviceRegistry?.enabled !== false) {
      this.modules.serviceRegistry = new ServiceRegistry(
        { enabled: true },
        this.stateManager,
        this.changelogManager
      );
    }

    // DDNS 控制器
    if (this.config.modules.ddns?.enabled) {
      this.modules.ddnsController = new DDNSController(
        this.config.modules.ddns,
        this.stateManager
      );
      this.modules.ddns = this.modules.ddnsController;
    }

    // Lucky 管理模块
    if (this.config.modules.lucky?.enabled) {
      this.modules.luckyManager = new LuckyManager(
        this.config.modules.lucky,
        this.stateManager,
        this.config.modules.sunpanel || null
      );
      // 用于兼容旧的接口
      this.modules.lucky = this.modules.luckyManager;
    }

    // Cloudflare DNS 管理模块
    if (this.config.modules.cloudflare?.enabled) {
      this.modules.cloudflareManager = new CloudflareManager(
        this.config.modules.cloudflare,
        this.stateManager
      );
    }

    // SunPanel 管理（集成在 LuckyManager 中）
    if (this.config.modules.sunpanel?.enabled) {
      this.modules.sunpanelManager = this.modules.luckyManager;
      this.modules.sunpanel = this.modules.luckyManager;
    }

    // 初始化所有模块（避免别名指向同一实例时重复初始化）
    const initializedModules = new Set();
    for (const [name, module] of Object.entries(this.modules)) {
      if (module && typeof module.init === 'function' && !initializedModules.has(module)) {
        initializedModules.add(module);
        await module.init();
      }
    }

    // 创建协调器
    this.coordinator = new Coordinator(
      this.modules,
      this.config.modules?.coordinator || {},
      this.stateManager
    );
    await this.coordinator.init();
    this.modules.coordinator = this.coordinator;

    console.log('✅ 所有模块初始化完成');
  }

  setupRoutes() {
    // 健康检查
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        version: '2.0.0'
      });
    });

    // 挂载新路由
    this.app.use('/api/dashboard', dashboardRoutes(this.modules));
    this.app.use('/api/devices', deviceRoutes(this.modules));
    this.app.use('/api/services', serviceRoutes(this.modules));
    this.app.use('/api/ddns', ddnsRoutes(this.modules));
    this.app.use('/api/proxies', proxyRoutes(this.modules));
    this.app.use('/api/cloudflare', cloudflareRoutes(this.modules));
    this.app.use('/api/bookmarks', bookmarkRoutes(this.modules));
    this.app.use('/api/changelog', changelogRoutes(this.modules));

    // 同步控制路由
    this.app.post('/api/sync/full', async (req, res) => {
      try {
        const result = await this.coordinator.runFullSync();
        res.json({ success: true, result });
      } catch (error) {
        console.error('[Sync] 完整同步失败:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/devices/refresh', async (req, res) => {
      try {
        const result = await this.coordinator.runDeviceMonitor();
        res.json(result);
      } catch (error) {
        console.error('[Devices] 刷新失败:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/proxies/sync', async (req, res) => {
      try {
        const result = await this.coordinator.runLuckySync();
        res.json(result);
      } catch (error) {
        console.error('[Proxies] Lucky同步失败:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/sunpanel/sync', async (req, res) => {
      try {
        const result = await this.coordinator.runSunpanelSync();
        res.json(result);
      } catch (error) {
        console.error('[SunPanel] SunPanel同步失败:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/cloudflare/sync', async (req, res) => {
      try {
        const result = await this.coordinator.runCloudflareSync();
        res.json(result);
      } catch (error) {
        console.error('[Cloudflare] Cloudflare同步失败:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // 兼容旧的状态路由
    this.app.get('/api/status', (req, res) => {
      try {
        res.json({
          status: this.coordinator.isRunning ? 'healthy' : 'stopped',
          uptime: Math.floor((Date.now() - this.startTime) / 1000),
          lastUpdate: new Date().toISOString(),
          modules: {
            coordinator: this.coordinator.isRunning ? 'ok' : 'stopped',
            deviceMonitor: this.modules.deviceMonitor?.getStatus()?.enabled ? 'ok' : 'disabled',
            ddns: this.modules.ddnsController?.getStatus()?.enabled ? 'ok' : 'disabled',
            lucky: this.modules.luckyManager?.getStatus()?.lucky?.enabled ? 'ok' : 'disabled',
            sunpanel: this.modules.sunpanelManager?.config?.enabled ? 'ok' : 'disabled',
            cloudflare: this.modules.cloudflareManager?.getStatus()?.enabled ? 'ok' : 'disabled'
          }
        });
      } catch (error) {
        console.error('[Status] 获取状态失败:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // 404
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // 错误处理
    this.app.use((err, req, res, next) => {
      console.error('错误:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: err.message
      });
    });
  }

  async start() {
    try {
      // 首先加载环境变量
      const loadedEnv = await loadEnvFile();
      if (Object.keys(loadedEnv).length === 0) {
        console.warn('⚠️  未找到 .env 文件，将使用配置文件中的值');
      }

      // 加载配置
      await this.loadConfig();

      const port = this.config.server.port || 3000;
      const host = this.config.server.host || '0.0.0.0';
      const runningHub = await isHubAlreadyRunning(host, port);

      if (runningHub.running) {
        console.log(`ℹ️  Central Hub 已在运行，跳过重复启动: ${runningHub.url}`);
        return;
      }

      // 初始化模块
      await this.initModules();

      // 设置路由
      this.setupRoutes();

      // 启动协调器（定时任务）
      await this.coordinator.start();

      // 启动服务器
      this.server = this.app.listen(port, host, () => {
        console.log('');
        console.log('🚀 Central Hub Service v2.0 已启动');
        console.log(`📍 地址: http://${host}:${port}`);
        console.log(`📊 监控: http://${host}:${port}/`);
        console.log(`🏥 健康: http://${host}:${port}/api/health`);
        console.log(`📈 概览: http://${host}:${port}/api/dashboard/overview`);
        console.log('');
      });

      this.server.on('error', async (error) => {
        if (error.code === 'EADDRINUSE') {
          const activeHub = await isHubAlreadyRunning(host, port);
          if (activeHub.running) {
            console.log(`ℹ️  Central Hub 已在运行，跳过重复启动: ${activeHub.url}`);
            process.exit(0);
            return;
          }
        }

        console.error('❌ 启动失败:', error);
        process.exit(1);
      });

      // 处理退出信号
      process.on('SIGTERM', () => this.shutdown('SIGTERM'));
      process.on('SIGINT', () => this.shutdown('SIGINT'));

    } catch (error) {
      console.error('❌ 启动失败:', error);
      process.exit(1);
    }
  }

  async shutdown(signal) {
    console.log(`\n收到 ${signal} 信号，正在关闭...`);

    // 停止协调器
    if (this.coordinator) {
      this.coordinator.stop();
    }

    // 保存状态
    if (this.stateManager) {
      await this.stateManager.save();
    }

    // 关闭服务器
    if (this.server) {
      this.server.close(() => {
        console.log('✅ 服务器已关闭');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
}

// 主函数
async function main() {
  const configPath = process.env.CONFIG_PATH ||
    path.join(__dirname, 'config', 'hub.json');

  const hub = new CentralHub(configPath);
  await hub.start();
}

// 启动服务
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('启动失败:', error);
    process.exit(1);
  });
}

export default CentralHub;
