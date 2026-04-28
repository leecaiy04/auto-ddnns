#!/usr/bin/env node
/**
 * 代理路由
 */
import express from 'express';

export default function createProxyRoutes(modules) {
  const router = express.Router();

  // GET /api/proxies/ - Lucky 代理状态
  router.get('/', async (req, res) => {
    try {
      const status = modules.luckyManager?.getStatus() || {};
      res.json({
        enabled: status.enabled || false,
        port: status.port,
        proxyCount: status.proxyCount || 0,
        lastSync: status.lastSync || null,
        ddnsTasks: status.ddnsTasks || [],
        ddnsLastReconcile: status.ddnsLastReconcile || null
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/proxies/sync - 触发 Lucky 同步（通过协调器编排）
  router.get('/sync', async (req, res) => {
    try {
      if (!modules.coordinator) {
        return res.status(503).json({ error: '协调器未初始化' });
      }
      const result = await modules.coordinator.runLuckySync();
      await modules.stateManager?.save();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
