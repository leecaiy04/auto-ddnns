#!/usr/bin/env node
/**
 * SunPanel 路由
 */
import express from 'express';

export default function createSunpanelRoutes(modules) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const status = modules.sunpanelManager?.getStatus() || {};
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/sync', async (req, res) => {
    try {
      const services = modules.serviceRegistry?.getProxiedServices() || [];
      const luckyProxies = modules.luckyManager?.getLuckyProxies() || [];
      const luckyLanHost = modules.luckyManager?.getLanHost() || null;
      const result = await modules.sunpanelManager?.syncToSunPanel(services, luckyProxies, luckyLanHost);
      await modules.stateManager?.save();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/cards', async (req, res) => {
    try {
      const syncStatus = modules.stateManager?.state?.sunpanel?.syncStatus || {};
      const cards = Object.values(syncStatus);
      res.json({ cards });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
