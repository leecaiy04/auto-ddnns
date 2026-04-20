/**
 * Services 路由 v2.0
 * 提供服务清单管理 API（白名单制）
 * 包括快速添加、远端清空、连通性检测
 */

import express from 'express';

async function triggerServiceSync(modules, reason) {
  if (!modules.coordinator) {
    return null;
  }

  const results = {};

  results.lucky = await modules.coordinator.runLuckySync();
  results.sunpanel = await modules.coordinator.runSunpanelSync();

  if (modules.cloudflareManager) {
    results.cloudflare = await modules.coordinator.runCloudflareSync();
  }

  return {
    success: true,
    reason,
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
      res.json({ success: true, service: newService, sync });
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
      res.json({ success: true, defaults: updated });
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
      res.json({ success: true, service: updatedService, sync });
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
      res.json({ message: '服务删除成功', success: true, sync });
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
   * Body: { deviceId, port, name, id, group?, description? }
   */
  router.post('/quick-add', async (req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }
      const { deviceId, port, name, id, group, description } = req.body;
      if (!deviceId || !port || !name || !id) {
        return res.status(400).json({ error: '缺少必填字段: deviceId, port, name, id' });
      }
      const service = await modules.serviceRegistry.quickAddFromScan({
        deviceId, port: parseInt(port, 10), name, id, group, description
      });
      const sync = await triggerServiceSync(modules, 'service_quick_add');
      res.json({ success: true, service, sync });
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
   */
  router.post('/purge-remote', async (_req, res) => {
    try {
      const results = { lucky: null, sunpanel: null };

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

      // 清空 SunPanel 卡片（通过 LuckyManager 的 purgeSunPanel 方法）
      if (modules.luckyManager) {
        try {
          const sunpanelResult = await modules.luckyManager.purgeSunPanel();
          results.sunpanel = sunpanelResult;
          console.log('[Services] ✅ SunPanel 本地同步状态已清空:', sunpanelResult);
        } catch (error) {
          console.error('[Services] ❌ 清空 SunPanel 失败:', error.message);
          results.sunpanel = { error: error.message };
        }
      }

      // 清空本地服务注册表
      if (modules.serviceRegistry) {
        await modules.serviceRegistry.clearAll();
      }

      // 记录日志
      modules.changelogManager?.append('purge_remote', 'all', '批量清空远端数据 (Lucky/SunPanel)', results);

      res.json({ success: true, message: '远端数据已清空', results });
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
      const results = [];

      for (const service of services) {
        const result = {
          id: service.id,
          name: service.name,
          ipv4Proxy: { url: null, ok: false, status: null, latency: null },
          ipv6Direct: { url: null, ok: false, status: null, latency: null }
        };

        // IPv4 反向代理 URL
        const luckyPort = proxyDefaults?.externalPorts?.lucky || 50000;
        result.ipv4Proxy.url = `https://${service.proxyDomain}:${luckyPort}`;

        try {
          const startTime = Date.now();
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(result.ipv4Proxy.url, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'manual'
          }).catch(() => null);
          clearTimeout(timeout);

          if (response) {
            result.ipv4Proxy.ok = response.status < 500;
            result.ipv4Proxy.status = response.status;
            result.ipv4Proxy.latency = Date.now() - startTime;
          }
        } catch { /* ignore */ }

        // IPv6 直连 URL
        const ipv6 = ipv6Map[service.device];
        if (ipv6) {
          result.ipv6Direct.url = modules.serviceRegistry.buildIpv6DirectUrl(service.id, ipv6);

          try {
            const startTime = Date.now();
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const response = await fetch(result.ipv6Direct.url, {
              method: 'HEAD',
              signal: controller.signal,
              redirect: 'manual'
            }).catch(() => null);
            clearTimeout(timeout);

            if (response) {
              result.ipv6Direct.ok = response.status < 500;
              result.ipv6Direct.status = response.status;
              result.ipv6Direct.latency = Date.now() - startTime;
            }
          } catch { /* ignore */ }
        }

        results.push(result);
      }

      res.json({ success: true, services: results, checkedAt: new Date().toISOString() });
    } catch (error) {
      console.error('[Services] 连通性检测失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
