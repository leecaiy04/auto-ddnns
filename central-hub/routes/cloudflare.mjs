#!/usr/bin/env node
/**
 * Cloudflare DNS 路由
 */
import express from 'express';

export default function createCloudflareRoutes(modules) {
  const router = express.Router();

  // 获取 CF DNS 记录列表和状态
  router.get('/', async (req, res) => {
    try {
      if (!modules.cloudflareManager) {
        return res.json({
          enabled: false,
          records: [],
          status: null
        });
      }

      const status = modules.cloudflareManager.getStatus();
      const records = status.enabled
        ? await modules.cloudflareManager.getDnsRecords()
        : [];

      res.json({
        enabled: status.enabled,
        domain: status.domain,
        recordCount: records.length,
        lastSync: status.lastSync,
        records
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // 验证 Token
  router.get('/verify-token', async (req, res) => {
    try {
      if (!modules.cloudflareManager) {
        return res.json({ valid: false, reason: 'Cloudflare 模块未启用' });
      }

      const result = await modules.cloudflareManager.verifyToken();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // 获取状态摘要
  router.get('/status', async (req, res) => {
    try {
      if (!modules.cloudflareManager) {
        return res.json({ enabled: false });
      }

      const status = modules.cloudflareManager.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // 手动触发同步
  router.post('/sync', async (req, res) => {
    try {
      if (!modules.cloudflareManager) {
        return res.status(400).json({ error: 'Cloudflare 模块未启用' });
      }

      // 获取服务清单和 IPv6 映射
      const services = modules.serviceRegistry?.getProxiedServices() || [];
      const ipv6Map = modules.deviceMonitor?.getIPv6Map() || {};

      const result = await modules.cloudflareManager.syncServicesToCF(services, ipv6Map);
      await modules.stateManager?.save();
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // 删除 DNS 记录
  router.delete('/record', async (req, res) => {
    try {
      if (!modules.cloudflareManager) {
        return res.status(400).json({ error: 'Cloudflare 模块未启用' });
      }

      const { name, type } = req.body;
      if (!name) {
        return res.status(400).json({ error: '缺少 name 参数' });
      }

      const result = await modules.cloudflareManager.deleteRecord(name, type || 'A');
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
