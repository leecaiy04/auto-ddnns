/**
 * Services 路由 v2.0
 * 提供服务清单管理 API（白名单制）
 * 包括快速添加、远端清空、连通性检测
 */

import express from 'express';
import { appendFileSync } from 'fs';

const CONNECTIVITY_PROBE_TIMEOUT_MS = 2500;

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase();
}

function getDeviceIpv6Domain(modules, deviceId) {
  const domains = modules?.config?.modules?.ddns?.domains?.ipv6;
  if (!Array.isArray(domains)) {
    return null;
  }

  const prefix = `${deviceId}.v6.`;
  return domains.find((domain) => normalizeDomain(domain).startsWith(prefix)) || null;
}

function buildIpv6DomainUrl(service, domain) {
  if (!domain || !service?.internalPort) {
    return null;
  }

  const protocol = service.internalProtocol || 'http';
  return `${protocol}://${domain}:${service.internalPort}`;
}


function getConnectivityProbeTimeout(modules) {
  const configured = Number(modules?.routeOptions?.connectivityProbeTimeoutMs);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : CONNECTIVITY_PROBE_TIMEOUT_MS;
}

async function probeUrl(url, timeoutMs) {
  if (!url) {
    return { url: null, ok: false, status: null, latency: null };
  }

  const startTime = Date.now();

  // 对于 HTTPS 请求，使用原生 https 模块以支持 rejectUnauthorized
  if (url.startsWith('https://')) {
    const https = await import('https');
    const urlObj = new URL(url);

    return new Promise((resolve) => {
      const options = {
        method: 'HEAD',
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        timeout: timeoutMs,
        rejectUnauthorized: false
      };

      const req = https.request(options, (res) => {
        resolve({
          url,
          ok: res.statusCode < 500,
          status: res.statusCode,
          latency: Date.now() - startTime
        });
        res.resume();
      });

      req.on('error', (error) => {
        resolve({
          url,
          ok: false,
          status: null,
          latency: Date.now() - startTime,
          error: error.code === 'ETIMEDOUT' ? 'timeout' : error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          url,
          ok: false,
          status: null,
          latency: Date.now() - startTime,
          error: 'timeout'
        });
      });

      req.end();
    });
  }

  // 对于 HTTP 请求，使用 fetch
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'manual'
    });

    return {
      url,
      ok: response.status < 500,
      status: response.status,
      latency: Date.now() - startTime
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: null,
      latency: Date.now() - startTime,
      error: error?.name === 'AbortError' ? 'timeout' : error?.message || 'request_failed'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function buildConnectivityResult(service, modules, ipv6Map, proxyDefaults) {
  const luckyPort = proxyDefaults?.externalPorts?.lucky || 55000;
  const ipv4Url = `https://${service.proxyDomain}:${luckyPort}`;
  const deviceId = String(service.device);
  const ipv6Domain = getDeviceIpv6Domain(modules, deviceId);
  const ipv6 = ipv6Map[deviceId] || modules.serviceRegistry.getDeviceById?.(deviceId)?.ipv6 || null;
  const ipv6DomainUrl = buildIpv6DomainUrl(service, ipv6Domain);
  const ipv6RawUrl = ipv6 ? modules.serviceRegistry.buildIpv6DirectUrl(service.id, ipv6) : null;
  const timeoutMs = getConnectivityProbeTimeout(modules);

  const [ipv4Proxy, ipv6FromDomain, ipv6FromRaw] = await Promise.all([
    probeUrl(ipv4Url, timeoutMs),
    probeUrl(ipv6DomainUrl, timeoutMs),
    probeUrl(ipv6RawUrl, timeoutMs)
  ]);

  let ipv6Direct = ipv6FromDomain;
  if (!ipv6FromDomain.ok) {
    ipv6Direct = ipv6FromRaw;
  }

  ipv6Direct = {
    ...ipv6Direct,
    source: ipv6FromDomain.ok ? 'domain' : (ipv6FromRaw.url ? 'ipv6' : null)
  };

  return {
    id: service.id,
    name: service.name,
    ipv4Proxy,
    ipv6Direct
  };
}

function buildMutationResponse({ successMessage, warningMessage, entityKey, entityValue, sync }) {
  const syncSuccess = sync?.success ?? true;
  const response = {
    success: true,
    syncSuccess,
    message: syncSuccess ? successMessage : warningMessage,
    sync
  };

  if (!syncSuccess) {
    response.warning = warningMessage;
  }

  if (entityKey) {
    response[entityKey] = entityValue;
  }

  return response;
}

async function runSyncStep(label, runner) {
  try {
    return await runner();
  } catch (error) {
    return {
      success: false,
      failed: 1,
      error: error?.message || String(error),
      label
    };
  }
}

function isSyncStepSuccessful(result) {
  if (!result) {
    return true;
  }
  if (typeof result.success === 'boolean') {
    return result.success;
  }
  if (typeof result.failed === 'number') {
    return result.failed === 0;
  }
  if (Array.isArray(result.errors)) {
    return result.errors.length === 0;
  }
  return true;
}

async function triggerServiceSync(modules, reason) {
  const fs = await import('fs');
  fs.appendFileSync('/tmp/lucky-debug.log', `[${new Date().toISOString()}] triggerServiceSync called\n`);

  if (!modules.coordinator) {
    return null;
  }

  const results = {};

  fs.appendFileSync('/tmp/lucky-debug.log', `[${new Date().toISOString()}] Calling runLuckySync\n`);
  results.lucky = await runSyncStep('lucky', () => modules.coordinator.runLuckySync());
  fs.appendFileSync('/tmp/lucky-debug.log', `[${new Date().toISOString()}] runLuckySync result: ${JSON.stringify(results.lucky)}\n`);

  results.sunpanel = await runSyncStep('sunpanel', () => modules.coordinator.runSunpanelSync());

  if (modules.cloudflareManager) {
    results.cloudflare = await runSyncStep('cloudflare', () => modules.coordinator.runCloudflareSync());
  }

  const overallSuccess = Object.values(results).every(isSyncStepSuccessful);

  return {
    success: overallSuccess,
    reason,
    results,
    completedAt: new Date().toISOString()
  };
}

async function triggerProxyDefaultsSync(modules, proxyDefaults) {
  const results = {};

  if (modules.coordinator) {
    results.ddns = await runSyncStep('ddns', () => modules.coordinator.runDDNS());
  }

  results.services = await triggerServiceSync(modules, 'proxy_defaults_update');

  if (modules.luckyManager?.ensureManagedDomainCertificates) {
    results.certificates = await runSyncStep(
      'certificates',
      () => modules.luckyManager.ensureManagedDomainCertificates(proxyDefaults)
    );
  }

  const overallSuccess = Object.values(results).every(isSyncStepSuccessful);

  return {
    success: overallSuccess,
    reason: 'proxy_defaults_update',
    results,
    completedAt: new Date().toISOString()
  };
}

export function serviceRoutes(modules) {
  const router = express.Router();

  // ==================== 基本 CRUD ====================

  /**
   * 获取所有服务
   */
  router.get('/list', (_req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }
      const services = modules.serviceRegistry.getAllServices();
      res.json(services);
    } catch (error) {
      console.error('[Services] 获取服务列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 获取服务状态
   */
  router.get('/status', (_req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }
      const status = modules.serviceRegistry.getStatus();
      res.json(status);
    } catch (error) {
      console.error('[Services] 获取服务状态失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 添加新服务
   */
  router.post('/add', async (req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }
      const service = req.body;
      const validation = modules.serviceRegistry.validateService(service);
      if (!validation.valid) {
        return res.status(400).json({ error: '配置验证失败', details: validation.errors });
      }
      const newService = await modules.serviceRegistry.addService(service);
      const sync = await triggerServiceSync(modules, 'service_add');
      res.json(buildMutationResponse({
        successMessage: '服务已添加并完成同步',
        warningMessage: '服务已添加，但后续同步存在失败项，请查看 sync 结果',
        entityKey: 'service',
        entityValue: newService,
        sync
      }));
    } catch (error) {
      console.error('[Services] 添加服务失败:', error);
      const status = error.message.includes('已存在') ? 400 : 500;
      res.status(status).json({ error: error.message });
    }
  });

  // ==================== 全局反代配置 ====================
  // 注意：这些特定路由必须在 /:id 之前定义，否则会被匹配为服务ID

  /**
   * 获取全局反代默认配置
   * GET /api/services/proxy-defaults
   */
  router.get('/proxy-defaults', (_req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }
      const defaults = modules.serviceRegistry.getProxyDefaults();
      res.json(defaults);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 更新全局反代默认配置
   * PUT /api/services/proxy-defaults
   */
  router.put('/proxy-defaults', async (req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }
      const updated = await modules.serviceRegistry.updateProxyDefaults(req.body);
      const sync = await triggerProxyDefaultsSync(modules, updated);
      res.json(buildMutationResponse({
        successMessage: '全局反代配置已保存并完成发布',
        warningMessage: '全局反代配置已保存，但后续发布存在失败项，请查看 sync 结果',
        entityKey: 'defaults',
        entityValue: updated,
        sync
      }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 更新服务
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }
      const existingService = modules.serviceRegistry.getServiceById(id);
      if (!existingService) {
        return res.status(404).json({ error: `服务ID ${id} 不存在` });
      }
      const updatedService = await modules.serviceRegistry.updateService(id, updates);
      const sync = await triggerServiceSync(modules, 'service_update');
      res.json(buildMutationResponse({
        successMessage: '服务已更新并完成同步',
        warningMessage: '服务已更新，但后续同步存在失败项，请查看 sync 结果',
        entityKey: 'service',
        entityValue: updatedService,
        sync
      }));
    } catch (error) {
      console.error('[Services] 更新服务失败:', error);
      const status = error.message.includes('不存在') ? 404 : 500;
      res.status(status).json({ error: error.message });
    }
  });

  router.post('/validate', (req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }
      const validation = modules.serviceRegistry.validateService(req.body);
      res.json(validation);
    } catch (error) {
      console.error('[Services] 验证服务失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 删除服务
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }
      await modules.serviceRegistry.deleteService(id);
      const sync = await triggerServiceSync(modules, 'service_delete');
      res.json(buildMutationResponse({
        successMessage: '服务已删除并完成同步',
        warningMessage: '服务已删除，但后续同步存在失败项，请查看 sync 结果',
        sync
      }));
    } catch (error) {
      console.error('[Services] 删除服务失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 清空所有服务
   */
  router.delete('/all/clear', async (_req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务注册表模块未初始化' });
      }
      await modules.serviceRegistry.clearAll();
      res.json({ message: '所有服务已成功清空' });
    } catch (error) {
      console.error('[Services] 清空全部服务失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== 快速添加（白名单制核心） ====================

  /**
   * 从端口扫描快速添加服务
   * POST /api/services/quick-add
   * Body: { deviceId, port, id, name?, group?, description? }
   */
  router.post('/quick-add', async (req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }
      const { deviceId, port, name, id, group, description, ipv6 } = req.body;
      const serviceId = String(id || '').trim();
      if (!deviceId || !port || !serviceId) {
        return res.status(400).json({ error: '缺少必填字段: deviceId, port, id' });
      }
      const serviceName = String(name || '').trim() || serviceId;
      const service = await modules.serviceRegistry.quickAddFromScan({
        deviceId, port: parseInt(port, 10), name: serviceName, id: serviceId, group, description, ipv6
      });
      const sync = await triggerServiceSync(modules, 'service_quick_add');
      res.json(buildMutationResponse({
        successMessage: '服务已注册并完成同步',
        warningMessage: '服务已注册，但 Lucky / SunPanel / Cloudflare 仍有未同步成功的项目，请查看 sync 结果',
        entityKey: 'service',
        entityValue: service,
        sync
      }));
    } catch (error) {
      console.error('[Services] 快速添加失败:', error);
      const status = error.message.includes('已存在') ? 400 : 500;
      res.status(status).json({ error: error.message });
    }
  });

  // ==================== 远端清空 ====================

  /**
   * 批量清空 Lucky/SunPanel 远端数据
   * POST /api/services/purge-remote
   * Body (可选): { sunpanelOnlyNames: ["card1", "card2"] } - 手动指定要删除的 SunPanel 卡片
   */
  router.post('/purge-remote', async (req, res) => {
    try {
      const results = { lucky: null, sunpanel: null };
      const { sunpanelOnlyNames } = req.body || {};
      const debug = {
        timestamp: new Date().toISOString(),
        receivedBody: req.body,
        parsedOnlyNames: sunpanelOnlyNames,
        sunpanelManagerExists: !!modules.sunpanelManager
      };

      // 清空 Lucky 反向代理规则
      if (modules.luckyManager) {
        try {
          const luckyResult = await modules.luckyManager.purgeLucky();
          results.lucky = luckyResult;
          console.log('[Services] ✅ Lucky 反向代理规则已清空:', luckyResult);
        } catch (error) {
          console.error('[Services] ❌ 清空 Lucky 失败:', error.message);
          results.lucky = { error: error.message };
        }
      }

      // 清空 SunPanel 卡片（通过 SunPanelManager 的 purgeSunPanel 方法）
      if (modules.sunpanelManager) {
        try {
          debug.callingPurgeSunPanel = true;
          debug.argumentPassed = sunpanelOnlyNames;
          const sunpanelResult = await modules.sunpanelManager.purgeSunPanel(sunpanelOnlyNames);
          debug.purgeSunPanelResult = sunpanelResult;
          results.sunpanel = sunpanelResult;
          console.log('[Services] ✅ SunPanel 卡片已清空:', sunpanelResult);
        } catch (error) {
          console.error('[Services] ❌ 清空 SunPanel 失败:', error.message);
          results.sunpanel = { error: error.message };
          debug.purgeSunPanelError = error.message;
        }
      }

      // 清空本地服务注册表
      if (modules.serviceRegistry) {
        await modules.serviceRegistry.clearAll();
      }

      // 记录日志
      modules.changelogManager?.append('purge_remote', 'all', '批量清空远端数据 (Lucky/SunPanel)', results);

      res.json({
        success: true,
        message: '远端数据已清空 [CODE_VERSION_2026-05-03-16:10]',
        results,
        debug
      });
    } catch (error) {
      console.error('[Services] 清空远端数据失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== 连通性检测 ====================

  /**
   * 检测所有服务的 IPv4 反代可用性和 IPv6 直连可用性
   * GET /api/services/connectivity
   */
  router.get('/connectivity', async (_req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }

      const services = modules.serviceRegistry.getAllServices();
      const ipv6Map = modules.deviceMonitor?.getIPv6Map() || {};
      const proxyDefaults = modules.serviceRegistry.getProxyDefaults();
      const results = await Promise.all(
        services.map((service) => buildConnectivityResult(service, modules, ipv6Map, proxyDefaults))
      );

      res.json({ success: true, services: results, checkedAt: new Date().toISOString() });
    } catch (error) {
      console.error('[Services] 连通性检测失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
