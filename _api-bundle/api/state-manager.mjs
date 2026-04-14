#!/usr/bin/env node
/**
 * 状态管理器
 * 负责状态的持久化和恢复
 */

import fs from 'fs/promises';
import path from 'path';

export class StateManager {
  constructor(config) {
    this.config = config;
    this.state = {
      version: '1.0.0',
      lastUpdate: null,
      uptime: 0,
      startTime: new Date().toISOString(),
      router: { history: [] },
      ddns: { domains: [], history: [] },
      lucky: { proxies: [], history: [] },
      sunpanel: { cards: [], history: [] }
    };
    this.initialized = false;
  }

  getBackupKeepCount() {
    const configured = this.config.backupKeepHistory ?? this.config.keepHistory ?? 10;
    const parsed = Number.parseInt(configured, 10);

    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      return 1;
    }

    return Math.max(parsed, 1);
  }

  async init() {
    try {
      await this.load();
      this.initialized = true;
      console.log('✅ 状态管理器初始化完成');
    } catch (error) {
      console.warn('⚠️  状态文件不存在，使用默认状态');
      this.initialized = true;
    }
  }

  async load() {
    try {
      const content = await fs.readFile(this.config.path, 'utf-8');
      this.state = JSON.parse(content);
      console.log('✅ 状态加载成功');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw error;
      }
      throw new Error(`状态加载失败: ${error.message}`);
    }
  }

  async save() {
    if (!this.initialized) return;

    try {
      // 更新时间戳
      this.state.lastUpdate = new Date().toISOString();
      this.state.uptime = Math.floor((Date.now() - new Date(this.state.startTime)) / 1000);

      // 保存状态
      await fs.mkdir(path.dirname(this.config.path), { recursive: true });
      await fs.writeFile(this.config.path, JSON.stringify(this.state, null, 2));

      // 备份
      if (this.config.backupPath) {
        await this.backup();
      }

      // 清理历史
      this.cleanupHistory();
    } catch (error) {
      console.error('❌ 状态保存失败:', error.message);
      throw error;
    }
  }

  async backup() {
    try {
      await fs.mkdir(this.config.backupPath, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.config.backupPath, `state-${timestamp}.json`);
      await fs.writeFile(backupPath, JSON.stringify(this.state, null, 2));
      await this.cleanupBackups();
    } catch (error) {
      console.error('❌ 备份失败:', error.message);
    }
  }

  async cleanupBackups() {
    try {
      const files = await fs.readdir(this.config.backupPath);
      const backups = files.filter(f => f.startsWith('state-') && f.endsWith('.json'));
      const keepCount = this.getBackupKeepCount();

      if (backups.length > keepCount) {
        // 按时间排序
        backups.sort();
        const toDelete = backups.slice(0, backups.length - keepCount);

        for (const file of toDelete) {
          const filePath = path.join(this.config.backupPath, file);
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      console.error('❌ 清理备份失败:', error.message);
    }
  }

  cleanupHistory() {
    const maxHistory = this.config.keepHistory || 10;

    // 清理路由器历史
    if (this.state.router.history.length > maxHistory) {
      this.state.router.history = this.state.router.history.slice(-maxHistory);
    }

    // 清理 DDNS 历史
    if (this.state.ddns.history.length > maxHistory) {
      this.state.ddns.history = this.state.ddns.history.slice(-maxHistory);
    }

    // 清理 Lucky 历史
    if (this.state.lucky.history.length > maxHistory) {
      this.state.lucky.history = this.state.lucky.history.slice(-maxHistory);
    }

    // 清理 SunPanel 历史
    if (this.state.sunpanel.history.length > maxHistory) {
      this.state.sunpanel.history = this.state.sunpanel.history.slice(-maxHistory);
    }
  }

  addHistory(module, data) {
    const history = this.state[module]?.history;
    if (!history) return;

    history.push({
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  // Getter 方法
  getState() {
    return { ...this.state };
  }

  getRouterState() {
    return this.state.router;
  }

  getDDNSState() {
    return this.state.ddns;
  }

  getLuckyState() {
    return this.state.lucky;
  }

  getSunpanelState() {
    return this.state.sunpanel;
  }

  // Setter 方法
  updateRouterState(data) {
    this.state.router = { ...this.state.router, ...data };
  }

  updateDDNSState(data) {
    this.state.ddns = { ...this.state.ddns, ...data };
  }

  updateLuckyState(data) {
    this.state.lucky = { ...this.state.lucky, ...data };
  }

  updateSunpanelState(data) {
    this.state.sunpanel = { ...this.state.sunpanel, ...data };
  }
}
