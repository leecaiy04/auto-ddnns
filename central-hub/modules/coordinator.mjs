/**
 * 总协调器模块
 * 负责调度所有子模块，执行定时任务
 */

import cron from 'node-cron';
import { DeviceMonitor } from './device-monitor.mjs';
import { ServiceRegistry } from './service-registry.mjs';
import { LuckyManager } from './lucky-manager.mjs';
import { NPMManager } from './npm-manager.mjs';

export class Coordinator {
  constructor(modules, config, stateManager) {
    this.modules = modules;
    this.config = config;
    this.stateManager = stateManager;
    this.scheduledTasks = new Map();
    this.isRunning = false;
  }

  /**
   * 初始化协调器
   */
  async init() {
    console.log('[Coordinator] 初始化总协调器...');

    // 初始化各模块
    if (this.modules.deviceMonitor) {
      await this.modules.deviceMonitor.init();
    }
    if (this.modules.serviceRegistry) {
      await this.modules.serviceRegistry.init();
    }
    if (this.modules.luckyManager) {
      await this.modules.luckyManager.init();
    }
    if (this.modules.npmManager) {
      await this.modules.npmManager.init();
    }

    console.log('[Coordinator] ✅ 总协调器初始化完成');
  }

  /**
   * 启动协调器
   */
  async start() {
    if (this.isRunning) {
      console.log('[Coordinator] ⚠️  协调器已在运行中');
      return;
    }

    console.log('[Coordinator] 🚀 启动总协调器...');

    const schedule = this.config?.schedule || this.config?.coordinator?.schedule || {};

    // 设备监控任务
    if (this.modules.deviceMonitor) {
      const cronExpression = schedule.deviceMonitor || '*/10 * * * *';
      this.scheduleTask('deviceMonitor', cronExpression, async () => {
        await this.runDeviceMonitor();
      });
      console.log(`[Coordinator] ✅ 设备监控任务已调度: ${cronExpression}`);
    }

    // DDNS任务（由DDNS模块处理）
    if (this.modules.ddnsController) {
      const cronExpression = schedule.ddns || '*/10 * * * *';
      this.scheduleTask('ddns', cronExpression, async () => {
        await this.runDDNS();
      });
      console.log(`[Coordinator] ✅ DDNS任务已调度: ${cronExpression}`);
    }

    // Lucky同步任务
    if (this.modules.luckyManager && this.modules.luckyManager.config.enabled) {
      const cronExpression = schedule.luckySync || '*/15 * * * *';
      this.scheduleTask('luckySync', cronExpression, async () => {
        await this.runLuckySync();
      });
      console.log(`[Coordinator] ✅ Lucky同步任务已调度: ${cronExpression}`);
    }

    // NPM同步任务
    if (this.modules.npmManager && this.modules.npmManager.config.enabled) {
      const cronExpression = schedule.npmSync || '*/15 * * * *';
      this.scheduleTask('npmSync', cronExpression, async () => {
        await this.runNPMSync();
      });
      console.log(`[Coordinator] ✅ NPM同步任务已调度: ${cronExpression}`);
    }

    // SunPanel同步任务
    if (this.modules.sunpanelManager && this.modules.sunpanelManager.config.enabled) {
      const cronExpression = schedule.sunpanelSync || '*/15 * * * *';
      this.scheduleTask('sunpanelSync', cronExpression, async () => {
        await this.runSunpanelSync();
      });
      console.log(`[Coordinator] ✅ SunPanel同步任务已调度: ${cronExpression}`);
    }

    // 状态保存任务（每分钟）
    this.scheduleTask('saveState', '* * * * *', async () => {
      await this.stateManager.save();
    });

    this.isRunning = true;
    console.log('[Coordinator] 🎉 总协调器启动完成');
  }

  /**
   * 停止协调器
   */
  stop() {
    console.log('[Coordinator] 🛑 停止总协调器...');

    for (const [name, task] of this.scheduledTasks.entries()) {
      task.stop();
      console.log(`[Coordinator] ✅ 已停止任务: ${name}`);
    }

    this.scheduledTasks.clear();
    this.isRunning = false;
    console.log('[Coordinator] ✅ 总协调器已停止');
  }

  /**
   * 调度定时任务
   */
  scheduleTask(name, expression, taskFn) {
    // 停止已存在的同名任务
    if (this.scheduledTasks.has(name)) {
      this.scheduledTasks.get(name).stop();
    }

    // 创建新任务
    const task = cron.schedule(expression, async () => {
      try {
        console.log(`[Coordinator] 🔔 执行任务: ${name}`);
        await taskFn();
        console.log(`[Coordinator] ✅ 任务完成: ${name}`);
      } catch (error) {
        console.error(`[Coordinator] ❌ 任务失败: ${name} - ${error.message}`);
      }
    }, {
      scheduled: false
    });

    // 启动任务
    task.start();

    // 保存任务引用
    this.scheduledTasks.set(name, task);
  }

  /**
   * 运行设备监控
   */
  async runDeviceMonitor() {
    if (!this.modules.deviceMonitor) return;

    const result = await this.modules.deviceMonitor.checkDevices();

    // 触发相关任务
    if (result.success) {
      // 设备检查成功后，可以触发服务同步
      // await this.runServiceSync();
    }
  }

  /**
   * 运行DDNS更新
   */
  async runDDNS() {
    if (!this.modules.ddnsController) return;

    await this.modules.ddnsController.update();
  }

  /**
   * 运行Lucky同步
   */
  async runLuckySync() {
    if (!this.modules.luckyManager || !this.modules.serviceRegistry) return;

    // 获取IPv6映射
    const ipv6Map = this.modules.deviceMonitor?.getIPv6Map() || {};

    // 获取需要同步的服务
    const services = this.modules.serviceRegistry.getProxiedServices();

    // 同步到Lucky
    const result = await this.modules.luckyManager.syncServicesToLucky(services, ipv6Map);

    return result;
  }

  /**
   * 运行NPM同步
   */
  async runNPMSync() {
    if (!this.modules.npmManager || !this.modules.serviceRegistry) return;

    // 获取IPv6映射
    const ipv6Map = this.modules.deviceMonitor?.getIPv6Map() || {};

    // 获取需要同步的服务
    const services = this.modules.serviceRegistry.getProxiedServices();

    // 同步到NPM
    const result = await this.modules.npmManager.syncServicesToNPM(services, ipv6Map);

    return result;
  }

  /**
   * 运行SunPanel同步
   */
  async runSunpanelSync() {
    if (!this.modules.luckyManager) return;

    // 从Lucky同步到SunPanel
    const result = await this.modules.luckyManager.syncToSunPanel();

    return result;
  }

  /**
   * 运行完整同步流程
   */
  async runFullSync() {
    console.log('[Coordinator] 🔄 开始完整同步流程...');

    const results = {};

    try {
      // 1. 设备监控
      if (this.modules.deviceMonitor) {
        console.log('[Coordinator] 📡 步骤1: 设备监控...');
        results.deviceMonitor = await this.runDeviceMonitor();
      }

      // 2. Lucky同步
      if (this.modules.luckyManager) {
        console.log('[Coordinator] 🎲 步骤2: Lucky同步...');
        results.luckySync = await this.runLuckySync();
      }

      // 3. NPM同步
      if (this.modules.npmManager) {
        console.log('[Coordinator] 📋 步骤3: NPM同步...');
        results.npmSync = await this.runNPMSync();
      }

      // 4. SunPanel同步
      if (this.modules.luckyManager) {
        console.log('[Coordinator] 🌞 步骤4: SunPanel同步...');
        results.sunpanelSync = await this.runSunpanelSync();
      }

      console.log('[Coordinator] 🎉 完整同步流程完成');
    } catch (error) {
      console.error('[Coordinator] ❌ 完整同步流程失败:', error.message);
      throw error;
    }

    return results;
  }

  /**
   * 获取所有模块的状态
   */
  getAllStatus() {
    const status = {
      coordinator: {
        isRunning: this.isRunning,
        scheduledTasks: Array.from(this.scheduledTasks.keys())
      }
    };

    if (this.modules.deviceMonitor) {
      status.deviceMonitor = this.modules.deviceMonitor.getStatus();
    }

    if (this.modules.serviceRegistry) {
      status.serviceRegistry = this.modules.serviceRegistry.getStatus();
    }

    if (this.modules.ddnsController) {
      status.ddns = this.modules.ddnsController.getStatus();
    }

    if (this.modules.luckyManager) {
      status.lucky = this.modules.luckyManager.getStatus();
    }

    if (this.modules.npmManager) {
      status.npm = this.modules.npmManager.getStatus();
    }

    if (this.modules.sunpanelManager) {
      status.sunpanel = this.modules.luckyManager.getStatus().sunpanel;
    }

    return status;
  }

  /**
   * 获取概览信息
   */
  getOverview() {
    const status = this.getAllStatus();

    return {
      coordinator: {
        isRunning: status.coordinator.isRunning,
        tasks: status.coordinator.scheduledTasks.length
      },
      devices: {
        total: status.deviceMonitor?.totalDevices || 0,
        ipv6Ready: status.deviceMonitor?.ipv6Ready || 0,
        lastUpdate: status.deviceMonitor?.lastUpdate || null
      },
      services: {
        total: status.serviceRegistry?.totalServices || 0,
        proxied: status.serviceRegistry?.proxiedServices || 0
      },
      ddns: {
        lastUpdate: status.ddns?.lastUpdate || null,
        enabled: status.ddns?.enabled || false
      },
      proxies: {
        lucky: status.lucky?.sunpanel?.cardsCount || 0,
        npm: status.npm?.syncCount || 0
      },
      sunpanel: {
        lastSync: status.sunpanel?.lastSync || null,
        cardsCount: status.sunpanel?.cardsCount || 0
      }
    };
  }
}

export default Coordinator;
