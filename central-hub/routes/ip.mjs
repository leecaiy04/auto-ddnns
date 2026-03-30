#!/usr/bin/env node
/**
 * IP 路由
 */
import express from 'express';

export default function createIPRoutes(modules) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const ipInfo = modules.router?.getCurrentIP() || {};
      const state = modules.stateManager?.getRouterState() || {};

      res.json({
        ipv4: ipInfo.ipv4 || state.ipv4,
        ipv6: ipInfo.ipv6 || state.ipv6,
        gateway: state.gateway,
        lastCheck: state.lastCheck,
        changed: state.changed || false
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/refresh', async (req, res) => {
    try {
      const result = await modules.router?.checkIP();
      await modules.stateManager?.save();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
