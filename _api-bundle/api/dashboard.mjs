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

  return {
    ...overview,
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
