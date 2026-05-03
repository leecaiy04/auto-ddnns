/**
 * 总协调器模块
 * 负责调度所有子模块，执行定时任务
 */

import cron from 'node-cron';

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

    // DDNS 任务调和（通过 Lucky 内置 DDNS）
    if (this.modules.luckyManager?.config?.ddnsConfig?.enabled) {
      const cronExpression = schedule.ddns || '0 * * * *';
      this.scheduleTask('ddns', cronExpression, async () => {
        await this.runDDNSReconcile();
      });
      console.log(`[Coordinator] ✅ DDNS 调和任务已调度: ${cronExpression}`);
    }

    // Lucky同步任务
    if (this.modules.luckyManager && this.modules.luckyManager.config.enabled) {
      const cronExpression = schedule.luckySync || '*/15 * * * *';
      this.scheduleTask('luckySync', cronExpression, async () => {
        await this.runLuckySync();
      });
      console.log(`[Coordinator] ✅ Lucky同步任务已调度: ${cronExpression}`);
    }

    // SunPanel同步任务
    if (this.modules.sunpanelManager && this.modules.sunpanelManager.config.enabled) {
      const cronExpression = schedule.sunpanelSync || '*/15 * * * *';
      this.scheduleTask('sunpanelSync', cronExpression, async () => {
        await this.runSunpanelSync();
      });
      console.log(`[Coordinator] ✅ SunPanel同步任务已调度: ${cronExpression}`);
    }

    // Cloudflare DNS 同步任务
    if (this.modules.cloudflareManager && this.modules.cloudflareManager.config.enabled) {
      const cronExpression = schedule.cloudflareSync || '*/15 * * * *';
      this.scheduleTask('cloudflareSync', cronExpression, async () => {
        await this.runCloudflareSync();
      });
      console.log(`[Coordinator] ✅ Cloudflare DNS同步任务已调度: ${cronExpression}`);
    }

    // 状态保存任务（每分钟）
    this.scheduleTask('saveState', '* * * * *', async () => {
      await this.stateManager.save();
    });

    this.isRunning = true;
    console.log('[Coordinator] 🎉 总协调器启动完成');

    // 启动后立即执行一次 DDNS 调和
    if (this.modules.luckyManager?.config?.ddnsConfig?.enabled) {
      setImmediate(async () => {
        try {
          console.log('[Coordinator] 🔄 执行初始 DDNS 任务调和...');
          await this.runDDNSReconcile();
        } catch (error) {
          console.error('[Coordinator] ❌ 初始 DDNS 调和失败:', error.message);
        }
      });
    }
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

    return result;
  }

  /**
   * 运行 DDNS 任务调和（通过 Lucky 内置 DDNS）
   */
  async runDDNSReconcile() {
    if (!this.modules.luckyManager) return;

    console.log('[Coordinator] 🔄 DDNS 任务调和...');
    const result = await this.modules.luckyManager.reconcileDDNSTasks();

    this.stateManager.addHistory?.('ddns', {
      event: 'reconcile',
      success: result.errors.length === 0,
      created: result.created,
      removed: result.removed,
      unchanged: result.unchanged,
      errors: result.errors
    });

    return result;
  }

  /**
   * 运行Lucky同步
   */
  async runLuckySync() {
    console.log('[Coordinator] runLuckySync called');

    if (!this.modules.luckyManager || !this.modules.serviceRegistry) {
      console.log('[Coordinator] runLuckySync: missing modules, returning early');
      return;
    }

    // 获取IPv6映射
    const ipv6Map = this.modules.deviceMonitor?.getIPv6Map() || {};
    console.log('[Coordinator] runLuckySync: got ipv6Map with', Object.keys(ipv6Map).length, 'entries');

    // 获取需要同步的服务
    const services = this.modules.serviceRegistry.getProxiedServices();
    console.log('[Coordinator] runLuckySync: got', services.length, 'services');

    // 同步到Lucky
    console.log('[Coordinator] runLuckySync: calling syncServicesToLucky');
    const result = await this.modules.luckyManager.syncServicesToLucky(services, ipv6Map);
    console.log('[Coordinator] runLuckySync: syncServicesToLucky returned', result);

    return result;
  }

  /**
   * 运行SunPanel同步
   */
  async runSunpanelSync() {
    if (!this.modules.sunpanelManager || !this.modules.luckyManager) return;

    const services = this.modules.serviceRegistry?.getProxiedServices() || [];
    const luckyProxies = await this.modules.luckyManager.getLuckyProxies();
    const luckyLanHost = this.modules.luckyManager.getLanHost();
    const result = await this.modules.sunpanelManager.syncToSunPanel(services, luckyProxies, luckyLanHost);

    return result;
  }

  /**
   * 运行Cloudflare DNS同步
   */
  async runCloudflareSync() {
    if (!this.modules.cloudflareManager || !this.modules.serviceRegistry) return;

    // 获取IPv6映射
    const ipv6Map = this.modules.deviceMonitor?.getIPv6Map() || {};

    // 获取需要同步的服务
    const services = this.modules.serviceRegistry.getProxiedServices();

    // 同步到Cloudflare
    const result = await this.modules.cloudflareManager.syncServicesToCF(services, ipv6Map);

    return result;
  }

  /**
   * 运行完整同步流程
   */
  async runFullSync() {
    console.log('[Coordinator] 🔄 开始完整同步流程...');

    const results = {};
    const failedSteps = [];
    let stepIndex = 0;

    const runStep = async (key, label, runner) => {
      stepIndex += 1;
      console.log(`[Coordinator] ${label} 步骤${stepIndex}: ${key}...`);

      try {
        const result = await runner();
        results[key] = result ?? { success: true, skipped: false };

        const stepFailed =
          results[key]?.success === false ||
          (typeof results[key]?.failed === 'number' && results[key].failed > 0);

        if (stepFailed) {
          failedSteps.push(key);
        }
      } catch (error) {
        console.error(`[Coordinator] ❌ 步骤失败: ${key} - ${error.message}`);
        results[key] = {
          success: false,
          error: error.message,
          skipped: true
        };
        failedSteps.push(key);
      }
    };

    if (this.modules.deviceMonitor) {
      await runStep('deviceMonitor', '📡', () => this.runDeviceMonitor());
    }

    if (this.modules.luckyManager?.config?.ddnsConfig?.enabled) {
      await runStep('ddns', '🌐', () => this.runDDNSReconcile());
    }

    if (this.modules.luckyManager) {
      await runStep('luckySync', '🎲', () => this.runLuckySync());
    }

    if (this.modules.sunpanelManager) {
      await runStep('sunpanelSync', '🌞', () => this.runSunpanelSync());
    }

    if (this.modules.cloudflareManager) {
      await runStep('cloudflareSync', '☁️', () => this.runCloudflareSync());
    }

    console.log('[Coordinator] 🎉 完整同步流程完成');

    return {
      success: failedSteps.length === 0,
      failedSteps,
      results,
      completedAt: new Date().toISOString()
    };
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

    if (this.modules.luckyManager) {
      status.lucky = this.modules.luckyManager.getStatus();

      status.ddns = {
        enabled: this.modules.luckyManager.config.ddnsConfig?.enabled || false,
        ddnsTasks: status.lucky.ddnsTasks || [],
        ddnsLastReconcile: status.lucky.ddnsLastReconcile || null
      };
    }

    if (this.modules.sunpanelManager) {
      status.sunpanel = this.modules.sunpanelManager.getStatus();
    }

    if (this.modules.cloudflareManager) {
      status.cloudflare = this.modules.cloudflareManager.getStatus();
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
        lastReconcile: status.ddns?.ddnsLastReconcile || null,
        enabled: status.ddns?.enabled || false,
        taskCount: (status.ddns?.ddnsTasks || []).length
      },
      proxies: {
        lucky: status.lucky?.proxyCount || 0
      },
      sunpanel: {
        lastSync: status.sunpanel?.lastSync || null,
        cardsCount: status.sunpanel?.cardsCount || 0
      },
      cloudflare: {
        enabled: status.cloudflare?.enabled || false,
        domain: status.cloudflare?.domain || null,
        recordCount: status.cloudflare?.recordCount || 0,
        lastSync: status.cloudflare?.lastSync || null
      }
    };
  }
}

export default Coordinator;
