#!/usr/bin/env node
/**
 * DDNS 控制器模块
 * 触发和管理 DDNS 更新
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, '..', '..');
const WINDOWS_BASH_CANDIDATES = [
  process.env.GIT_BASH_PATH,
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe'
].filter(Boolean);

function resolveScriptPath(scriptPath) {
  return path.isAbsolute(scriptPath)
    ? scriptPath
    : path.resolve(PROJECT_ROOT, scriptPath);
}

function buildLanDevicesCacheLines(stateManager) {
  const devices = stateManager?.state?.devices?.devices || {};

  return Object.values(devices)
    .filter(device => device?.ipv4 && device?.ipv6)
    .map(device => `${device.mac || ''}|${device.ipv4}|${device.ipv6}|`);
}

function resolveBashCommand() {
  if (process.platform !== 'win32') {
    return 'bash';
  }

  const gitBash = WINDOWS_BASH_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!gitBash) {
    throw new Error('Windows 环境未找到可用的 Bash，请安装 Git for Windows 或设置 GIT_BASH_PATH');
  }

  return gitBash;
}

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
      const scriptPath = resolveScriptPath(this.config.scriptPath);
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`DDNS 脚本不存在: ${scriptPath}`);
      }
      const bashCommand = resolveBashCommand();
      const execOptions = {
        cwd: PROJECT_ROOT,
        env: process.env,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true
      };

      const lanDevicesLines = buildLanDevicesCacheLines(this.stateManager);
      let stdout = '';
      let stderr = '';

      if (lanDevicesLines.length > 0) {
        const cachePath = path.resolve(PROJECT_ROOT, '.lan_devices.txt');
        fs.writeFileSync(cachePath, `${lanDevicesLines.join('\n')}\n`, 'utf8');

        const ddnsResult = await execFileAsync(
          bashCommand,
          [scriptPath, 'ddns'],
          execOptions
        );
        const htmlResult = await execFileAsync(
          bashCommand,
          [scriptPath, 'html'],
          execOptions
        );

        stdout = [ddnsResult.stdout, htmlResult.stdout].filter(Boolean).join('\n');
        stderr = [ddnsResult.stderr, htmlResult.stderr].filter(Boolean).join('\n');
      } else {
        const fullResult = await execFileAsync(
          bashCommand,
          [scriptPath, 'all'],
          execOptions
        );
        stdout = fullResult.stdout;
        stderr = fullResult.stderr;
      }

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
    return {
      ...this.stateManager.getDDNSState(),
      enabled: this.config.enabled !== false,
      scriptPath: this.config.scriptPath
    };
  }

  getHistory() {
    return this.stateManager.getDDNSState()?.history || [];
  }
}
