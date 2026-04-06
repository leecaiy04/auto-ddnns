/**
 * Dashboard 路由
 * 提供监控仪表板 API
 */

import express from 'express';

async function buildOverview(modules) {
  const overview = modules.coordinator.getOverview();

  let luckyActual = overview.proxies?.lucky ?? 0;

  if (modules.luckyManager?.config?.enabled) {
    try {
      luckyActual = (await modules.luckyManager.getLuckyProxies()).length;
    } catch (error) {
      console.error('[Dashboard] 获取 Lucky 实际代理数失败:', error.message);
    }
  }

  const ddnsStatus = modules.ddnsController?.getStatus?.() || modules.ddns?.getStatus?.() || {};
  const ddnsSummary = ddnsStatus.summary || {};
  const ddnsLastResult = ddnsStatus.lastResult || {};
  const ipv4Summary = ddnsSummary.ipv4Summary || ddnsLastResult.ipv4Summary || {};
  const ipv6Summary = ddnsSummary.ipv6Summary || ddnsLastResult.ipv6Summary || {};

  return {
    ...overview,
    ddns: {
      ...(overview.ddns || {}),
      enabled: ddnsStatus.enabled ?? overview.ddns?.enabled ?? false,
      publishStatus: ddnsStatus.publishStatus || ddnsSummary.publishStatus || ddnsLastResult.status || 'unknown',
      lastUpdate: ddnsSummary.lastUpdate || ddnsLastResult.timestamp || null,
      lastSuccessAt: ddnsSummary.lastSuccessAt || null,
      lastFailureAt: ddnsSummary.lastFailureAt || null,
      failedDomains: ddnsSummary.failedDomains || [],
      failedDomainCount: ddnsSummary.failedDomainCount || 0,
      trackedDomains: ddnsSummary.trackedDomains || [],
      totalHosts: ddnsSummary.totalHosts || 0,
      successCount: ddnsSummary.successCount || 0,
      failureCount: ddnsSummary.failureCount || 0,
      ipv4Summary,
      ipv6Summary
    },
    proxies: {
      ...overview.proxies,
      lucky: luckyActual,
      luckyActual
    }
  };
}

export function dashboardRoutes(modules) {
  const router = express.Router();

  /**
   * 获取概览信息
   */
  router.get('/overview', async (_req, res) => {
    try {
      if (!modules.coordinator) {
        return res.status(503).json({ error: '协调器未初始化' });
      }

      const overview = await buildOverview(modules);
      res.json(overview);
    } catch (error) {
      console.error('[Dashboard] 获取概览失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/consistency', async (_req, res) => {
    try {
      if (!modules.luckyManager || !modules.serviceRegistry) {
        return res.status(503).json({ error: 'Lucky 或服务清单模块未初始化' });
      }

      const services = modules.serviceRegistry.getProxiedServices?.() || [];
      const ipv6Map = modules.deviceMonitor?.getIPv6Map?.() || {};
      const lucky = await modules.luckyManager.getLuckyConsistencyStatus(services, ipv6Map);
      const sunpanel = await modules.luckyManager.getSunPanelConsistencyStatus(services);

      res.json({ success: true, consistency: { lucky, sunpanel } });
    } catch (error) {
      console.error('[Dashboard] 获取一致性状态失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 获取完整状态
   */
  router.get('/status', (_req, res) => {
    try {
      if (!modules.coordinator) {
        return res.status(503).json({ error: '协调器未初始化' });
      }

      const status = modules.coordinator.getAllStatus();
      res.json(status);
    } catch (error) {
      console.error('[Dashboard] 获取状态失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
