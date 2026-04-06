#!/usr/bin/env node
/**
 * DDNS 路由
 */
import express from 'express';

export default function createDDNSRoutes(modules) {
  const router = express.Router();
  const ddnsModule = modules.ddnsController || modules.ddns;

  router.get('/', async (_req, res) => {
    try {
      const state = ddnsModule?.getStatus() || {};
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/summary', async (_req, res) => {
    try {
      if (!ddnsModule) {
        return res.status(503).json({ error: 'DDNS 模块未初始化' });
      }

      const summary = ddnsModule.getSummary?.() || ddnsModule.getStatus?.().summary || null;
      res.json({ success: true, summary });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/schedule', async (_req, res) => {
    try {
      if (!modules.coordinator) {
        return res.status(503).json({ error: '协调器未初始化' });
      }

      const task = modules.coordinator.getSchedulerStatus('ddns');
      res.json({ success: true, task });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/schedule', async (req, res) => {
    try {
      if (!modules.coordinator) {
        return res.status(503).json({ error: '协调器未初始化' });
      }

      const updates = {};
      if (req.body.enabled !== undefined) {
        updates.enabled = req.body.enabled;
      }
      if (req.body.expression !== undefined) {
        updates.expression = req.body.expression;
      }

      const task = await modules.coordinator.updateTaskSchedule('ddns', updates);
      await modules.stateManager?.save();
      res.json({ success: true, task });
    } catch (error) {
      const status = error.message.includes('cron') || error.message.includes('表达式') ? 400 : 500;
      res.status(status).json({ error: error.message });
    }
  });

  router.post('/refresh', async (_req, res) => {
    try {
      const result = await ddnsModule?.refresh();
      await modules.stateManager?.save();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/history', async (_req, res) => {
    try {
      const history = ddnsModule?.getHistory() || [];
      res.json({ history });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
