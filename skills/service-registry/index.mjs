/**
 * Service Registry Skill
 * 服务注册和发现功能
 */

import { ServiceRegistry } from '../../modules/service-registry/index.mjs';
import { StateManager } from '../../shared/state-manager.mjs';
import { ChangelogManager } from '../../shared/changelog-manager.mjs';
import { getEnv } from '../../shared/env-loader.mjs';

let registryInstance = null;

/**
 * 初始化服务注册表
 */
async function initRegistry() {
  if (!registryInstance) {
    const config = { enabled: true };
    const stateManager = new StateManager();
    await stateManager.init();

    const changelogManager = new ChangelogManager();
    await changelogManager.init();

    registryInstance = new ServiceRegistry(config, stateManager, changelogManager);
    await registryInstance.init();
  }
  return registryInstance;
}

/**
 * 注册服务
 */
export async function register(params) {
  const registry = await initRegistry();
  return await registry.addService(params);
}

/**
 * 注销服务
 */
export async function unregister(serviceId) {
  const registry = await initRegistry();
  return await registry.deleteService(serviceId);
}

/**
 * 列出所有服务
 */
export async function list(params = {}) {
  const registry = await initRegistry();
  return registry.getAllServices();
}

/**
 * 获取服务详情
 */
export async function get(serviceId) {
  const registry = await initRegistry();
  return registry.getServiceById(serviceId);
}

/**
 * 更新服务
 */
export async function update(serviceId, updates) {
  const registry = await initRegistry();
  return await registry.updateService(serviceId, updates);
}

/**
 * 批量注册服务
 */
export async function batchRegister(services) {
  const results = [];

  for (const service of services) {
    try {
      const result = await register(service);
      results.push({
        service: service.name,
        status: 'success',
        result
      });
    } catch (error) {
      results.push({
        service: service.name,
        status: 'error',
        error: error.message
      });
    }
  }

  return results;
}

/**
 * 验证服务配置
 */
export async function validate(service) {
  const registry = await initRegistry();
  return registry.validateService(service);
}

export default {
  register,
  unregister,
  list,
  get,
  update,
  batchRegister,
  validate
};
