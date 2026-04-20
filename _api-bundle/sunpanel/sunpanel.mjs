#!/usr/bin/env node
/**
 * SunPanel 路由
 */
import express from 'express';

export default function createSunpanelRoutes(modules) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const state = modules.sunpanel?.getState() || {};
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/sync', async (req, res) => {
    try {
      const result = await modules.sunpanel?.sync();
      await modules.stateManager?.save();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/cards', async (req, res) => {
    try {
      const cards = modules.sunpanel?.getCards() || [];
      res.json({ cards });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
