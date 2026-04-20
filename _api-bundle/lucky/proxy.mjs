#!/usr/bin/env node
/**
 * 代理路由
 */
import express from 'express';

export default function createProxyRoutes(modules) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const state = modules.lucky?.getState() || {};
      res.json({
        count: state.proxyCount || 0,
        proxies: state.proxies || [],
        lastSync: state.lastSync
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/sync', async (req, res) => {
    try {
      const result = await modules.lucky?.sync();
      await modules.stateManager?.save();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
