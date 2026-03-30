#!/usr/bin/env node
/**
 * DDNS 控制器模块
 * 触发和管理 DDNS 更新
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DDNSController {
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
  }

  async init() {
    console.log('🌐 初始化 DDNS 控制器...');
    console.log('✅ DDNS 控制器初始化完成');
  }

  async update(force = false) {
    try {
      if (!this.config.enabled) {
        console.log('⏭️  DDNS 已禁用，跳过更新');
        return null;
      }

      console.log('🔄 执行 DDNS 更新...');
      const { stdout, stderr } = await execAsync(this.config.scriptPath);

      const result = {
        success: !stderr,
        output: stdout,
        error: stderr,
        timestamp: new Date().toISOString()
      };

      // 更新状态
      this.stateManager.updateDDNSState({
        lastUpdate: result.timestamp,
        lastResult: result
      });

      this.stateManager.addHistory('ddns', {
        event: 'update',
        success: result.success,
        output: result.output
      });

      if (result.success) {
        console.log('✅ DDNS 更新成功');
      } else {
        console.warn('⚠️  DDNS 更新失败:', result.error);
      }

      return result;
    } catch (error) {
      console.error('❌ DDNS 更新异常:', error.message);

      const result = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };

      this.stateManager.addHistory('ddns', {
        event: 'update',
        success: false,
        error: error.message
      });

      return result;
    }
  }

  async refresh() {
    return await this.update(true);
  }

  getStatus() {
    return this.stateManager.getDDNSState();
  }

  getHistory() {
    return this.stateManager.getDDNSState()?.history || [];
  }
}
