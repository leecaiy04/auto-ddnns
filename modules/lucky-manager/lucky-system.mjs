#!/usr/bin/env node
/**
 * Lucky 系统信息 API
 * 用于获取 Lucky 版本、系统信息、模块列表等
 */

import { openTokenFetch } from './lucky-api.mjs';

/**
 * 获取 Lucky 版本信息
 * @param {Object} config - 配置对象
 * @returns {Promise<{ret: number, version: string, buildTime: string}>}
 */
export async function getVersion(config = null) {
  return await openTokenFetch('/version', {}, config);
}

/**
 * 获取系统信息
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 系统信息，包括模块列表、版本等
 */
export async function getSystemInfo(config = null) {
  return await openTokenFetch('/api/info', {}, config);
}

/**
 * 获取模块列表
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 模块列表
 */
export async function getModuleList(config = null) {
  return await openTokenFetch('/api/modules/list', {}, config);
}

/**
 * 获取系统统计信息
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 系统统计信息
 */
export async function getSystemStats(config = null) {
  return await openTokenFetch('/api/stats', {}, config);
}

/**
 * 测试 Lucky 连接
 * @param {Object} config - 配置对象
 * @returns {Promise<boolean>} 连接是否成功
 */
export async function testConnection(config = null) {
  try {
    const version = await getVersion(config);
    if (version.ret === 0 && version.version) {
      console.log(`✅ Lucky 连接成功！版本: ${version.version}`);
      return true;
    }
    console.error('❌ Lucky 连接失败: 返回格式异常');
    return false;
  } catch (error) {
    console.error('❌ Lucky 连接失败:', error.message);
    return false;
  }
}
