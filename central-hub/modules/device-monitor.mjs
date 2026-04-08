/**
 * 设备监控模块
 * 负责通过SSH查询设备的IPv6地址，更新设备状态
 */

import { getIPv6Neighbors, buildDeviceAddressMap } from '../../lib/ssh-client.mjs';
import { getEnv } from '../../lib/utils/env-loader.mjs';

const PUBLIC_DOMAIN = getEnv('ALIYUN_DOMAIN', '222869.xyz');

export class DeviceMonitor {
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
    this.router = {
      host: getEnv('ROUTER_HOST', config.router?.host || '192.168.3.1'),
      username: getEnv('ROUTER_USERNAME', config.router?.username || 'root'),
      password: getEnv('ROUTER_PASSWORD', ''),
      timeout: config.router?.timeout || 10000
    };
  }

  getTrackedDeviceIds() {
    return Array.isArray(this.config.devices)
      ? this.config.devices.map(deviceId => String(deviceId))
      : [];
  }

  /**
   * 初始化模块
   */
  async init() {
    console.log('[DeviceMonitor] 初始化设备监控模块...');

    if (!this.router.password) {
      console.warn('[DeviceMonitor] ⚠️  路由器密码未设置，SSH功能将不可用');
      console.warn('[DeviceMonitor] 请设置 ROUTER_PASSWORD 环境变量');
    }

    // 初始化状态中的设备信息
    if (!this.stateManager.state.devices) {
      this.stateManager.state.devices = {
        lastUpdate: null,
        devices: {},
        ipv6Map: {}
      };
    }

    console.log('[DeviceMonitor] ✅ 设备监控模块初始化完成');
  }

  /**
   * 检查设备IPv6地址
   */
  async checkDevices() {
    if (!this.router.password) {
      console.warn('[DeviceMonitor] ⚠️  路由器密码未设置，跳过设备检查');
      return {
        success: false,
        message: '路由器密码未设置'
      };
    }

    try {
      console.log('[DeviceMonitor] 🔍 开始检查设备IPv6地址...');

      // 构建设备地址映射
      const deviceMap = await buildDeviceAddressMap(this.router);

      // 更新状态
      const devices = {};
      const ipv6Map = {};

      const trackedDeviceIds = this.getTrackedDeviceIds();
      for (const [ipv4, info] of deviceMap.entries()) {
        const deviceId = ipv4.split('.').pop(); // 获取IP最后一位作为设备ID
        if (trackedDeviceIds.length > 0 && !trackedDeviceIds.includes(deviceId)) {
          continue;
        }

        devices[deviceId] = {
          ipv4,
          ipv6: info.ipv6,
          mac: info.mac,
          ipv6State: info.ipv6State,
          ipv6Interface: info.ipv6Interface,
          lastSeen: new Date().toISOString()
        };

        if (info.ipv6) {
          ipv6Map[deviceId] = info.ipv6;
        }
      }

      // 更新状态管理器
      this.stateManager.state.devices = {
        lastUpdate: new Date().toISOString(),
        devices,
        ipv6Map,
        totalDevices: Object.keys(devices).length,
        ipv6Ready: Object.values(devices).filter(d => d.ipv6).length
      };

      await this.stateManager.save();

      console.log(`[DeviceMonitor] ✅ 设备检查完成: ${Object.keys(devices).length} 个设备, ${Object.values(devices).filter(d => d.ipv6).length} 个有IPv6`);

      return {
        success: true,
        totalDevices: Object.keys(devices).length,
        ipv6Ready: Object.values(devices).filter(d => d.ipv6).length,
        devices
      };
    } catch (error) {
      console.error('[DeviceMonitor] ❌ 设备检查失败:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * 获取指定设备的IPv6地址
   * @param {string} deviceId - 设备ID (IP最后一位，如 "10", "200")
   * @returns {string|null>} IPv6地址或null
   */
  getDeviceIPv6(deviceId) {
    return this.stateManager.state.devices?.ipv6Map?.[deviceId] || null;
  }

  /**
   * 获取指定设备的完整信息
   * @param {string} deviceId - 设备ID
   * @returns {object|null>} 设备信息或null
   */
  getDeviceInfo(deviceId) {
    return this.stateManager.state.devices?.devices?.[deviceId] || null;
  }

  /**
   * 获取所有设备列表
   * @returns {Array>} 设备列表
   */
  getAllDevices() {
    const devices = this.stateManager.state.devices?.devices || {};
    return Object.entries(devices).map(([id, info]) => ({
      id,
      ...info
    }));
  }

  /**
   * 获取IPv6地址映射表
   * @returns {object>} IPv6地址映射 (deviceId -> ipv6)
   */
  getIPv6Map() {
    return this.stateManager.state.devices?.ipv6Map || {};
  }

  /**
   * 获取设备状态摘要
   * @returns {object>} 状态摘要
   */
  getStatus() {
    const devices = this.stateManager.state.devices;
    return {
      lastUpdate: devices?.lastUpdate || null,
      totalDevices: devices?.totalDevices || 0,
      ipv6Ready: devices?.ipv6Ready || 0,
      enabled: this.config.enabled
    };
  }

  /**
   * 生成端口映射对照表
   * @returns {object>} 端口映射对照表
   */
  generatePortMappingTable() {
    const devices = this.getAllDevices();
    const ipv6Map = this.getIPv6Map();

    const table = {
      lastUpdate: new Date().toISOString(),
      entries: devices.map(device => ({
        deviceId: device.id,
        ipv4: device.ipv4,
        ipv6: device.ipv6,
        mac: device.mac,
        domain: device.ipv6 ? `${device.id}.v6.${PUBLIC_DOMAIN}` : null,
        ready: !!device.ipv6
      }))
    };

    return table;
  }
}

export default DeviceMonitor;
