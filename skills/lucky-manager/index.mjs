/**
 * Lucky Manager Skill
 * 提供 Lucky 反向代理管理功能
 */

import { createDDNSTask, getDDNSTaskList, updateDDNSTask, deleteDDNSTask } from '../../modules/lucky-manager/lucky-ddns.mjs';
import { listAllPorts, smartCreateOrAddProxy, getAllProxies } from '../../modules/lucky-manager/lucky-port-manager.mjs';
import { applyACMECert, getSSLList } from '../../modules/lucky-manager/lucky-ssl.mjs';
import { getEnv } from '../../shared/env-loader.mjs';

const luckyConfig = {
  apiBase: getEnv('LUCKY_API_BASE'),
  openToken: getEnv('LUCKY_OPEN_TOKEN')
};

/**
 * 列出所有 DDNS 任务
 */
export async function listDDNS() {
  return await getDDNSTaskList(luckyConfig);
}

/**
 * 创建 DDNS 任务
 */
export async function createDDNS(params) {
  return await createDDNSTask(params, luckyConfig);
}

/**
 * 更新 DDNS 任务
 */
export async function updateDDNS(taskId, params) {
  return await updateDDNSTask(taskId, params, luckyConfig);
}

/**
 * 删除 DDNS 任务
 */
export async function deleteDDNS(taskId) {
  return await deleteDDNSTask(taskId, luckyConfig);
}

/**
 * 列出所有端口配置
 */
export async function listPorts() {
  return await listAllPorts(luckyConfig);
}

/**
 * 创建端口监听
 */
export async function createPortListener(params) {
  const { port, name, domain, target, options = {} } = params;
  return await smartCreateOrAddProxy(port, name, domain, target, options, luckyConfig);
}

/**
 * 删除端口监听
 */
export async function deletePortListener(port) {
  // 注意：Lucky API 没有直接删除端口的接口，需要通过 Web 界面操作
  throw new Error('删除端口功能需要通过 Lucky Web 界面操作');
}

/**
 * 添加反向代理规则
 */
export async function createProxy(params) {
  const { port, name, domain, target, options = {} } = params;
  return await smartCreateOrAddProxy(port, name, domain, target, options, luckyConfig);
}

/**
 * 删除反向代理规则
 */
export async function deleteProxy(port, ruleName) {
  // 注意：Lucky API 没有直接删除反向代理规则的接口
  throw new Error('删除反向代理规则功能需要通过 Lucky Web 界面操作');
}

/**
 * 列出所有反向代理规则
 */
export async function listProxies() {
  return await getAllProxies(luckyConfig);
}

/**
 * 申请 SSL 证书
 */
export async function applySSL(certConfig) {
  return await applyACMECert(certConfig, luckyConfig);
}

/**
 * 列出所有 SSL 证书
 */
export async function listSSL() {
  return await getSSLList(luckyConfig);
}

/**
 * 批量创建 DDNS 任务
 */
export async function batchCreateDDNS(tasks) {
  const results = [];

  for (const task of tasks) {
    try {
      const result = await createDDNSTask(task, luckyConfig);
      results.push({ task: task.name, status: 'success', result });
    } catch (error) {
      results.push({ task: task.name, status: 'error', error: error.message });
    }
  }

  return results;
}

export default {
  listDDNS,
  createDDNS,
  updateDDNS,
  deleteDDNS,
  listPorts,
  createPortListener,
  deletePortListener,
  createProxy,
  deleteProxy,
  listProxies,
  applySSL,
  listSSL,
  batchCreateDDNS
};
