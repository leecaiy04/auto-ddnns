#!/usr/bin/env node
/**
 * 同步控制路由
 * 统一管理各模块的同步触发
 */
import express from 'express';

export function syncRoutes(modules) {
  const router = express.Router();

  // POST /api/sync/full - 完整同步流程（设备扫描 → DDNS → Lucky → SunPanel → Cloudflare）
  router.post('/full', async (req, res) => {
    try {
      const result = await modules.coordinator.runFullSync();
      res.json({ success: true, result });
    } catch (error) {
      console.error('[Sync] 完整同步失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/sync/sunpanel - 触发 SunPanel 同步
  router.post('/sunpanel', async (req, res) => {
    try {
      const result = await modules.coordinator.runSunpanelSync();
      res.json(result);
    } catch (error) {
      console.error('[SunPanel] SunPanel同步失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
