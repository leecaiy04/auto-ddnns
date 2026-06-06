#!/usr/bin/env node
/**
 * Lucky 端口转发 API
 * 用于管理端口转发规则
 */

import { openTokenFetch } from './lucky-api.mjs';

/**
 * 获取端口转发规则列表
 * @param {Object} config - 配置对象
 * @returns {Promise<{ret: number, ruleList: Array}>}
 */
export async function getPortForwardRules(config = null) {
  return await openTokenFetch('/api/portforward/rules', {}, config);
}

/**
 * 添加端口转发规则
 * @param {Object} options - 端口转发选项
 * @param {string} options.name - 规则名称
 * @param {number} options.listenPort - 监听端口
 * @param {string} options.targetHost - 目标主机
 * @param {number} options.targetPort - 目标端口
 * @param {string} [options.network='tcp'] - 网络类型 (tcp/udp)
 * @param {boolean} [options.enable=true] - 是否启用
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>}
 */
export async function addPortForward({
  name,
  listenPort,
  targetHost,
  targetPort,
  network = 'tcp',
  enable = true,
  ...extraOptions
}, config = null) {
  const requestBody = {
    Remark: name,
    Network: network,
    ListenPort: listenPort,
    TargetHost: targetHost,
    TargetPort: targetPort,
    Enable: enable,
    ...extraOptions
  };

  return await openTokenFetch('/api/portforward/rule', {
    method: 'POST',
    body: requestBody
  }, config);
}

/**
 * 更新端口转发规则
 * @param {Object} options - 更新选项
 * @param {string} options.ruleKey - 规则 Key
 * @param {Object} updates - 要更新的字段
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>}
 */
export async function updatePortForward({ ruleKey, ...updates }, config = null) {
  const requestBody = {
    Key: ruleKey,
    ...updates
  };

  return await openTokenFetch('/api/portforward/rule', {
    method: 'PUT',
    body: requestBody
  }, config);
}

/**
 * 删除端口转发规则
 * @param {string} ruleKey - 规则 Key
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>}
 */
export async function deletePortForward(ruleKey, config = null) {
  return await openTokenFetch(`/api/portforward/rule?key=${encodeURIComponent(ruleKey)}`, {
    method: 'DELETE'
  }, config);
}

/**
 * 查找指定端口的转发规则
 * @param {number} listenPort - 监听端口
 * @param {Object} config - 配置对象
 * @returns {Promise<Object|null>} 规则对象或 null
 */
export async function findPortForwardByPort(listenPort, config = null) {
  const result = await getPortForwardRules(config);

  if (result.ret !== 0 || !Array.isArray(result.ruleList)) {
    return null;
  }

  return result.ruleList.find(rule => rule.ListenPort === listenPort) || null;
}

/**
 * 列出所有监听端口
 * @param {Object} config - 配置对象
 * @returns {Promise<number[]>} 端口号数组
 */
export async function listAllListenPorts(config = null) {
  const result = await getPortForwardRules(config);

  if (result.ret !== 0 || !Array.isArray(result.ruleList)) {
    return [];
  }

  return result.ruleList
    .filter(rule => rule.Enable)
    .map(rule => rule.ListenPort)
    .filter(Boolean);
}
