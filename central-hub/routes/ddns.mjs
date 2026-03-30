#!/usr/bin/env node
/**
 * DDNS 路由
 */
import express from 'express';

export default function createDDNSRoutes(modules) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const state = modules.ddns?.getStatus() || {};
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/refresh', async (req, res) => {
    try {
      const result = await modules.ddns?.refresh();
      await modules.stateManager?.save();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/history', async (req, res) => {
    try {
      const history = modules.ddns?.getHistory() || [];
      res.json({ history });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
