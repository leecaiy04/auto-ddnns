/**
 * 设备监控 Skill
 * 提供设备 IPv6 地址查询和监控功能
 */

import { DeviceMonitor } from '../../modules/device-monitor/index.mjs';
import { StateManager } from '../../shared/state-manager.mjs';
import { getEnv } from '../../shared/env-loader.mjs';

/**
 * 初始化设备监控器
 */
async function initMonitor() {
  const config = {
    enabled: true,
    router: {
      host: getEnv('ROUTER_HOST', '192.168.9.1'),
      username: getEnv('ROUTER_USERNAME', 'root'),
      password: getEnv('ROUTER_PASSWORD', ''),
      timeout: 10000
    }
  };

  const stateManager = new StateManager();
  await stateManager.init();

  const monitor = new DeviceMonitor(config, stateManager);
  await monitor.init();

  return monitor;
}

/**
 * 检查所有设备的 IPv6 地址
 * @returns {Promise<object>} 检查结果
 */
export async function checkDevices() {
  const monitor = await initMonitor();
  return await monitor.checkDevices();
}

/**
 * 获取指定设备的 IPv6 地址
 * @param {string} deviceId - 设备 ID (IP 最后一位，如 "10", "200")
 * @returns {Promise<string|null>} IPv6 地址或 null
 */
export async function getDeviceIPv6(deviceId) {
  const monitor = await initMonitor();
  return monitor.getDeviceIPv6(deviceId);
}

/**
 * 获取指定设备的完整信息
 * @param {string} deviceId - 设备 ID
 * @returns {Promise<object|null>} 设备信息或 null
 */
export async function getDeviceInfo(deviceId) {
  const monitor = await initMonitor();
  return monitor.getDeviceInfo(deviceId);
}

/**
 * 获取所有设备列表
 * @returns {Promise<Array>} 设备列表
 */
export async function getAllDevices() {
  const monitor = await initMonitor();
  return monitor.getAllDevices();
}

/**
 * 获取 IPv6 地址映射表
 * @returns {Promise<object>} IPv6 地址映射 (deviceId -> ipv6)
 */
export async function getIPv6Map() {
  const monitor = await initMonitor();
  return monitor.getIPv6Map();
}

/**
 * 获取设备监控状态摘要
 * @returns {Promise<object>} 状态摘要
 */
export async function getStatus() {
  const monitor = await initMonitor();
  return monitor.getStatus();
}

/**
 * 生成端口映射对照表
 * @returns {Promise<object>} 端口映射对照表
 */
export async function generatePortMappingTable() {
  const monitor = await initMonitor();
  return monitor.generatePortMappingTable();
}

// 默认导出所有功能
export default {
  checkDevices,
  getDeviceIPv6,
  getDeviceInfo,
  getAllDevices,
  getIPv6Map,
  getStatus,
  generatePortMappingTable
};
