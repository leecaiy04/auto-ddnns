#!/usr/bin/env node
/**
 * 代理路由
 */
import express from 'express';

function getManagedServices(modules) {
  return modules.serviceRegistry?.getProxiedServices?.() || [];
}

function getIPv6Map(modules) {
  return modules.deviceMonitor?.getIPv6Map?.() || {};
}

export default function createProxyRoutes(modules) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const state = modules.lucky?.getState?.() || {};
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
      if (!modules.coordinator) {
        return res.status(503).json({ error: '协调器未初始化' });
      }

      const result = await modules.coordinator.runLuckySync();
      await modules.stateManager?.save();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/consistency', async (_req, res) => {
    try {
      if (!modules.luckyManager || !modules.serviceRegistry) {
        return res.status(503).json({ error: 'Lucky 或服务清单模块未初始化' });
      }

      const services = getManagedServices(modules);
      const ipv6Map = getIPv6Map(modules);
      const lucky = await modules.luckyManager.getLuckyConsistencyStatus(services, ipv6Map);
      const sunpanel = await modules.luckyManager.getSunPanelConsistencyStatus(services);

      res.json({ success: true, lucky, sunpanel });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/consistency/lucky', async (_req, res) => {
    try {
      if (!modules.luckyManager || !modules.serviceRegistry) {
        return res.status(503).json({ error: 'Lucky 或服务清单模块未初始化' });
      }

      const services = getManagedServices(modules);
      const ipv6Map = getIPv6Map(modules);
      const consistency = await modules.luckyManager.getLuckyConsistencyStatus(services, ipv6Map);
      res.json({ success: true, consistency });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/consistency/sunpanel', async (_req, res) => {
    try {
      if (!modules.luckyManager || !modules.serviceRegistry) {
        return res.status(503).json({ error: 'Lucky 或服务清单模块未初始化' });
      }

      const services = getManagedServices(modules);
      const consistency = await modules.luckyManager.getSunPanelConsistencyStatus(services);
      res.json({ success: true, consistency });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
