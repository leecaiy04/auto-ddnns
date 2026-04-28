#!/usr/bin/env node
/**
 * 配置路由
 * 提供脱敏后的配置查看
 */
import express from 'express';

const SENSITIVE_KEYS = ['openToken', 'apiToken', 'password', 'apiSecret', 'secret', 'token',
  'CF_API_TOKEN', 'ALIYUN_AK', 'ALIYUN_SK', 'username'];

function stripSecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripSecrets);

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some(s => s.toLowerCase() === key.toLowerCase())) continue;
    clean[key] = typeof value === 'object' && value !== null ? stripSecrets(value) : value;
  }
  return clean;
}

export function configRoutes(modules) {
  const router = express.Router();

  // GET /api/config - 返回脱敏后的配置
  router.get('/', (req, res) => {
    try {
      const safeConfig = stripSecrets(modules.config || {});
      res.json(safeConfig);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
