#!/usr/bin/env node
/**
 * 路由器监控模块
 * 从路由器获取公网 IP 信息
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class RouterMonitor {
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
    this.currentIP = { ipv4: null, ipv6: null };
  }

  async init() {
    console.log('📡 初始化路由器监控...');
    await this.checkIP();
    console.log('✅ 路由器监控初始化完成');
  }

  async checkIP() {
    try {
      const [ipv4, ipv6] = await Promise.all([
        this.getIPv4(),
        this.getIPv6()
      ]);

      const changed = this.hasIPChanged({ ipv4, ipv6 });

      this.currentIP = { ipv4, ipv6 };

      const state = {
        ipv4,
        ipv6,
        gateway: this.config.gateway,
        lastCheck: new Date().toISOString(),
        changed
      };

      this.stateManager.updateRouterState(state);

      if (changed) {
        this.stateManager.addHistory('router', {
          event: 'ip-changed',
          ipv4,
          ipv6
        });
        console.log(`🌐 IP 已变更: ${ipv4 || 'N/A'}, ${ipv6 || 'N/A'}`);
      }

      return state;
    } catch (error) {
      console.error('❌ IP 检查失败:', error.message);
      throw error;
    }
  }

  async getIPv4() {
    try {
      // 方法 1: 从阿里云 DNS
      const { stdout } = await execAsync('curl -s --noproxy "*" -4 --max-time 5 http://myip.aliyun.com');
      const ip = stdout.trim();
      if (ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
        return ip;
      }
    } catch (error) {
      console.warn('⚠️  阿里云 DNS 获取 IPv4 失败');
    }

    try {
      // 方法 2: 从其他服务
      const { stdout } = await execAsync('curl -s --noproxy "*" -4 --max-time 5 https://api.ipify.org');
      const ip = stdout.trim();
      if (ip) return ip;
    } catch (error) {
      console.warn('⚠️  ipify 获取 IPv4 失败');
    }

    return null;
  }

  async getIPv6() {
    try {
      // 方法 1: 从阿里云 DNS
      const { stdout } = await execAsync('curl -s --noproxy "*" -6 --max-time 5 http://ipv6.aliyun.com');
      const ip = stdout.trim();
      if (ip && this.isValidIPv6(ip)) {
        return ip;
      }
    } catch (error) {
      console.warn('⚠️  阿里云 DNS 获取 IPv6 失败');
    }

    try {
      // 方法 2: 从本地接口获取
      const { stdout } = await execAsync("ip -6 addr show | grep 'inet6' | grep -v '^fe80' | awk '{print $2}' | cut -d/ -f1 | head -1");
      const ip = stdout.trim();
      if (ip && this.isValidIPv6(ip)) {
        return ip;
      }
    } catch (error) {
      console.warn('⚠️  本地接口获取 IPv6 失败');
    }

    return null;
  }

  isValidIPv6(ip) {
    // 简单的 IPv6 验证
    return /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/.test(ip) ||
           /^::$/.test(ip) ||
           /^([0-9a-fA-F]{0,4}:){1,7}:$/.test(ip);
  }

  hasIPChanged(newIP) {
    const oldIPv4 = this.currentIP.ipv4;
    const oldIPv6 = this.currentIP.ipv6;

    return (newIP.ipv4 && newIP.ipv4 !== oldIPv4) ||
           (newIP.ipv6 && newIP.ipv6 !== oldIPv6);
  }

  getCurrentIP() {
    return { ...this.currentIP };
  }
}
