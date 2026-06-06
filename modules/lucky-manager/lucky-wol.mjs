#!/usr/bin/env node
/**
 * Lucky WOL (Wake on LAN) API
 * 用于管理网络唤醒设备
 */

import { openTokenFetch } from './lucky-api.mjs';

/**
 * 获取 WOL 设备列表
 * @param {Object} config - 配置对象
 * @returns {Promise<{ret: number, list: Array}>}
 */
export async function getWolDevices(config = null) {
  return await openTokenFetch('/api/wol/devices', {}, config);
}

/**
 * 唤醒设备
 * @param {string} mac - MAC 地址
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>}
 */
export async function wakeDevice(mac, config = null) {
  return await openTokenFetch('/api/wol/wake', {
    method: 'POST',
    body: { mac }
  }, config);
}

/**
 * 添加 WOL 设备
 * @param {Object} options - 设备选项
 * @param {string} options.name - 设备名称
 * @param {string} options.mac - MAC 地址
 * @param {string} [options.ip] - IP 地址（可选）
 * @param {string} [options.broadcastAddr] - 广播地址（可选）
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>}
 */
export async function addWolDevice({ name, mac, ip = '', broadcastAddr = '' }, config = null) {
  const requestBody = {
    Name: name,
    MAC: mac,
    IP: ip,
    BroadcastAddr: broadcastAddr
  };

  return await openTokenFetch('/api/wol/device', {
    method: 'POST',
    body: requestBody
  }, config);
}

/**
 * 更新 WOL 设备
 * @param {Object} options - 更新选项
 * @param {string} options.deviceKey - 设备 Key
 * @param {Object} updates - 要更新的字段
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>}
 */
export async function updateWolDevice({ deviceKey, ...updates }, config = null) {
  const requestBody = {
    Key: deviceKey,
    ...updates
  };

  return await openTokenFetch('/api/wol/device', {
    method: 'PUT',
    body: requestBody
  }, config);
}

/**
 * 删除 WOL 设备
 * @param {string} deviceKey - 设备 Key
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>}
 */
export async function deleteWolDevice(deviceKey, config = null) {
  return await openTokenFetch(`/api/wol/device?key=${encodeURIComponent(deviceKey)}`, {
    method: 'DELETE'
  }, config);
}

/**
 * 根据 MAC 地址查找设备
 * @param {string} mac - MAC 地址
 * @param {Object} config - 配置对象
 * @returns {Promise<Object|null>} 设备对象或 null
 */
export async function findWolDeviceByMac(mac, config = null) {
  const result = await getWolDevices(config);

  if (result.ret !== 0 || !Array.isArray(result.list)) {
    return null;
  }

  const normalizedMac = mac.toLowerCase().replace(/[:-]/g, '');
  return result.list.find(device => {
    const deviceMac = (device.MAC || '').toLowerCase().replace(/[:-]/g, '');
    return deviceMac === normalizedMac;
  }) || null;
}
