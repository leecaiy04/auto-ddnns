#!/usr/bin/env node
/**
 * 配置路由
 */
import express from 'express';
import fs from 'fs/promises';

export default function createConfigRoutes(config) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      // 移除敏感信息
      const safeConfig = { ...config };
      if (safeConfig.lucky) delete safeConfig.lucky.openToken;
      if (safeConfig.sunpanel) delete safeConfig.sunpanel.apiToken;
      res.json(safeConfig);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/', async (req, res) => {
    try {
      // TODO: 实现配置更新
      res.json({ message: '配置更新功能待实现' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/reload', async (req, res) => {
    try {
      // TODO: 实现配置重载
      res.json({ message: '配置重载功能待实现' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
