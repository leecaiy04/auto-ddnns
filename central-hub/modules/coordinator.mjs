/**
 * 总协调器模块
 * 负责调度所有子模块，执行定时任务
 */

import cron from 'node-cron';

const TASK_DEFAULT_EXPRESSIONS = {
  deviceMonitor: '*/10 * * * *',
  ddns: '*/10 * * * *',
  luckySync: '*/15 * * * *',
  sunpanelSync: '*/15 * * * *',
  cloudflareSync: '*/15 * * * *',
  saveState: '* * * * *'
};

export class Coordinator {
  constructor(modules, config, stateManager) {
    this.modules = modules;
    this.config = config;
    this.stateManager = stateManager;
    this.scheduledTasks = new Map();
    this.isRunning = false;
  }

  ensureSchedulerState() {
    if (!this.stateManager.state.scheduler) {
      this.stateManager.state.scheduler = { tasks: {} };
    }

    if (!this.stateManager.state.scheduler.tasks) {
      this.stateManager.state.scheduler.tasks = {};
    }
  }

  getScheduleConfig() {
    return this.config?.schedule || this.config?.coordinator?.schedule || {};
  }

  getTaskDefinitions() {
    const schedule = this.getScheduleConfig();

    return {
      deviceMonitor: {
        available: Boolean(this.modules.deviceMonitor),
        expression: schedule.deviceMonitor || TASK_DEFAULT_EXPRESSIONS.deviceMonitor,
        runner: () => this.runDeviceMonitor()
      },
      ddns: {
        available: Boolean(this.modules.ddnsController),
        expression: schedule.ddns || TASK_DEFAULT_EXPRESSIONS.ddns,
        runner: () => this.runDDNS()
      },
      luckySync: {
        available: Boolean(this.modules.luckyManager && this.modules.luckyManager.config.enabled),
        expression: schedule.luckySync || TASK_DEFAULT_EXPRESSIONS.luckySync,
        runner: () => this.runLuckySync()
      },
      sunpanelSync: {
        available: Boolean(this.modules.sunpanelManager && this.modules.sunpanelManager.config.enabled),
        expression: schedule.sunpanelSync || TASK_DEFAULT_EXPRESSIONS.sunpanelSync,
        runner: () => this.runSunpanelSync()
      },
      cloudflareSync: {
        available: Boolean(this.modules.cloudflareManager && this.modules.cloudflareManager.config.enabled),
        expression: schedule.cloudflareSync || TASK_DEFAULT_EXPRESSIONS.cloudflareSync,
        runner: () => this.runCloudflareSync()
      },
      saveState: {
        available: Boolean(this.stateManager),
        expression: TASK_DEFAULT_EXPRESSIONS.saveState,
        runner: () => this.runStateSave(),
        persistResult: false
      }
    };
  }

  getTaskState(name, definition = null) {
    this.ensureSchedulerState();

    if (definition && !this.stateManager.state.scheduler.tasks[name]) {
      this.stateManager.state.scheduler.tasks[name] = {
        name,
        enabled: definition.available,
        expression: definition.expression,
        available: definition.available,
        lastRunAt: null,
        lastResult: null,
        lastError: null,
        updatedAt: new Date().toISOString()
      };
    }

    return this.stateManager.state.scheduler.tasks[name] || null;
  }

  setTaskState(name, patch = {}, definition = null) {
    const current = this.getTaskState(name, definition) || { name };
    const next = {
      ...current,
      ...patch,
      name,
      updatedAt: new Date().toISOString()
    };

    this.stateManager.state.scheduler.tasks[name] = next;
    return next;
  }

  syncTaskDefinitions() {
    const definitions = this.getTaskDefinitions();

    for (const [name, definition] of Object.entries(definitions)) {
      const existing = this.getTaskState(name, definition) || {};
      this.setTaskState(name, {
        available: definition.available,
        enabled: existing.enabled ?? definition.available,
        expression: existing.expression || definition.expression
      }, definition);
    }
  }

  /**
   * 初始化协调器
   */
  async init() {
    console.log('[Coordinator] 初始化总协调器...');
    this.ensureSchedulerState();
    this.syncTaskDefinitions();
    await this.stateManager.save();
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
    this.syncTaskDefinitions();

    const definitions = this.getTaskDefinitions();
    for (const [name, definition] of Object.entries(definitions)) {
      this.applyTaskSchedule(name, definition);
    }

    this.isRunning = true;
    await this.stateManager.save();
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

  applyTaskSchedule(name, definition) {
    const taskState = this.getTaskState(name, definition);

    if (!definition.available) {
      this.unscheduleTask(name);
      this.setTaskState(name, { available: false }, definition);
      return;
    }

    if (taskState?.enabled === false) {
      this.unscheduleTask(name);
      console.log(`[Coordinator] ⏭️ 任务已禁用，跳过调度: ${name}`);
      return;
    }

    this.scheduleTask(name, taskState.expression, definition.runner);
    console.log(`[Coordinator] ✅ ${name} 任务已调度: ${taskState.expression}`);
  }

  unscheduleTask(name) {
    if (this.scheduledTasks.has(name)) {
      this.scheduledTasks.get(name).stop();
      this.scheduledTasks.delete(name);
    }
  }

  /**
   * 调度定时任务
   */
  scheduleTask(name, expression, taskFn) {
    this.unscheduleTask(name);

    const task = cron.schedule(expression, async () => {
      try {
        await taskFn();
      } catch (error) {
        console.error(`[Coordinator] ❌ 任务失败: ${name} - ${error.message}`);
      }
    }, {
      scheduled: false
    });

    task.start();
    this.scheduledTasks.set(name, task);
  }

  async runTrackedTask(name, runner) {
    const startedAt = new Date().toISOString();
    const definitions = this.getTaskDefinitions();
    const definition = definitions[name] || {};
    this.setTaskState(name, {
      lastRunAt: startedAt,
      lastError: null
    });

    try {
      console.log(`[Coordinator] 🔔 执行任务: ${name}`);
      const result = await runner();
      const normalizedResult = result ?? { success: true, timestamp: startedAt };
      const success =
        normalizedResult.success !== false &&
        !(typeof normalizedResult.failed === 'number' && normalizedResult.failed > 0);

      this.setTaskState(name, {
        lastRunAt: startedAt,
        lastResult: normalizedResult,
        lastError: success ? null : (normalizedResult.error || '任务执行失败')
      });

      if (definition.persistResult !== false) {
        await this.stateManager.save();
      }

      if (success) {
        console.log(`[Coordinator] ✅ 任务完成: ${name}`);
      } else {
        console.warn(`[Coordinator] ⚠️ 任务未完全成功: ${name}`);
      }

      return normalizedResult;
    } catch (error) {
      const failure = {
        success: false,
        error: error.message,
        timestamp: startedAt
      };

      this.setTaskState(name, {
        lastRunAt: startedAt,
        lastResult: failure,
        lastError: error.message
      });

      if (definition.persistResult !== false) {
        await this.stateManager.save();
      }
      console.error(`[Coordinator] ❌ 任务异常: ${name} - ${error.message}`);
      return failure;
    }
  }

  getSchedulerStatus(name = null) {
    this.syncTaskDefinitions();

    const definitions = this.getTaskDefinitions();
    const tasks = Object.entries(definitions).map(([taskName, definition]) => {
      const taskState = this.getTaskState(taskName, definition);
      return {
        ...taskState,
        running: this.scheduledTasks.has(taskName)
      };
    });

    if (name) {
      return tasks.find(task => task.name === name) || null;
    }

    return { tasks };
  }

  async updateTaskSchedule(name, updates = {}) {
    const definitions = this.getTaskDefinitions();
    const definition = definitions[name];

    if (!definition) {
      throw new Error(`未知任务: ${name}`);
    }

    const patch = {};

    if (updates.expression !== undefined) {
      const expression = `${updates.expression || ''}`.trim();
      if (!expression) {
        throw new Error('cron 表达式不能为空');
      }
      if (!cron.validate(expression)) {
        throw new Error(`无效的 cron 表达式: ${expression}`);
      }
      patch.expression = expression;
    }

    if (updates.enabled !== undefined) {
      patch.enabled = Boolean(updates.enabled);
    }

    const taskState = this.setTaskState(name, patch, definition);

    if (this.isRunning) {
      this.applyTaskSchedule(name, definition);
    }

    await this.stateManager.save();
    return {
      ...taskState,
      running: this.scheduledTasks.has(name)
    };
  }

  /**
   * 运行设备监控
   */
  async runDeviceMonitor() {
    if (!this.modules.deviceMonitor) return null;

    return await this.runTrackedTask('deviceMonitor', async () => {
      const result = await this.modules.deviceMonitor.checkDevices();
      return result;
    });
  }

  /**
   * 运行DDNS更新
   */
  async runDDNS() {
    if (!this.modules.ddnsController) return null;

    return await this.runTrackedTask('ddns', async () => {
      return await this.modules.ddnsController.update();
    });
  }

  /**
   * 运行Lucky同步
   */
  async runLuckySync() {
    if (!this.modules.luckyManager || !this.modules.serviceRegistry) return null;

    return await this.runTrackedTask('luckySync', async () => {
      const ipv6Map = this.modules.deviceMonitor?.getIPv6Map() || {};
      const services = this.modules.serviceRegistry.getProxiedServices();
      return await this.modules.luckyManager.syncServicesToLucky(services, ipv6Map);
    });
  }

  /**
   * 运行SunPanel同步
   */
  async runSunpanelSync() {
    if (!this.modules.luckyManager || !this.modules.serviceRegistry) return null;

    return await this.runTrackedTask('sunpanelSync', async () => {
      const services = this.modules.serviceRegistry.getProxiedServices() || [];
      return await this.modules.luckyManager.syncToSunPanel(services);
    });
  }

  /**
   * 运行Cloudflare DNS同步
   */
  async runCloudflareSync() {
    if (!this.modules.cloudflareManager || !this.modules.serviceRegistry) return null;

    return await this.runTrackedTask('cloudflareSync', async () => {
      const ipv6Map = this.modules.deviceMonitor?.getIPv6Map() || {};
      const services = this.modules.serviceRegistry.getProxiedServices();
      return await this.modules.cloudflareManager.syncServicesToCF(services, ipv6Map);
    });
  }

  async runStateSave() {
    if (!this.stateManager) return null;

    return await this.runTrackedTask('saveState', async () => {
      await this.stateManager.save();
      return {
        success: true,
        timestamp: new Date().toISOString()
      };
    });
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

    if (this.modules.ddnsController) {
      await runStep('ddns', '🌐', () => this.runDDNS());
    }

    if (this.modules.luckyManager) {
      await runStep('luckySync', '🎲', () => this.runLuckySync());
    }

    if (this.modules.luckyManager) {
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
        scheduledTasks: Array.from(this.scheduledTasks.keys()),
        scheduler: this.getSchedulerStatus()
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

    if (this.modules.sunpanelManager) {
      status.sunpanel = this.modules.luckyManager.getStatus().sunpanel;
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
    const ddnsSchedule = this.getSchedulerStatus('ddns');

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
        enabled: status.ddns?.enabled || false,
        autoSync: ddnsSchedule?.enabled || false,
        expression: ddnsSchedule?.expression || null
      },
      proxies: {
        lucky: status.lucky?.lucky?.proxyCount || 0
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
