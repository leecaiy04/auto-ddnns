/**
 * Service Registry Skill
 * 服务注册和发现功能
 */

import { registerService, unregisterService, listServices, getServiceStatus } from '../../modules/service-registry/registry.mjs';

/**
 * 注册服务
 */
export async function register(params) {
  const { name, url, type, metadata = {} } = params;
  return await registerService({ name, url, type, metadata });
}

/**
 * 注销服务
 */
export async function unregister(serviceId) {
  return await unregisterService(serviceId);
}

/**
 * 列出所有服务
 */
export async function list(params = {}) {
  const { type, status } = params;
  return await listServices({ type, status });
}

/**
 * 获取服务状态
 */
export async function getStatus(serviceId) {
  return await getServiceStatus(serviceId);
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

export default {
  register,
  unregister,
  list,
  getStatus,
  batchRegister
};
