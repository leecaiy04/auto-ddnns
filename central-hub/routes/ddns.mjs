#!/usr/bin/env node
/**
 * DDNS 路由
 * 通过 Lucky 内置 DDNS 功能管理 DNS 记录
 */
import express from 'express';

export default function createDDNSRoutes(modules) {
  const router = express.Router();
  const ddns = modules.luckyManager;

  // GET /api/ddns/ - 获取 DDNS 任务状态
  router.get('/', async (req, res) => {
    try {
      const status = await ddns?.getDDNSTaskStatus();
      res.json(status || { success: false, tasks: [] });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/ddns/reconcile - 调和 DDNS 任务（创建缺失的、删除孤立的）
  router.post('/reconcile', async (req, res) => {
    try {
      const result = await ddns?.reconcileDDNSTasks();
      await modules.stateManager?.save();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/ddns/refresh - 兼容旧接口，等同 reconcile
  router.post('/refresh', async (req, res) => {
    try {
      const result = await ddns?.reconcileDDNSTasks();
      await modules.stateManager?.save();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/ddns/sync/:taskKey - 手动触发指定任务同步
  router.post('/sync/:taskKey', async (req, res) => {
    try {
      const { taskKey } = req.params;
      const result = await ddns?.syncDDNSTask(taskKey);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/ddns/logs - Lucky DDNS 日志
  router.get('/logs', async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const pageSize = parseInt(req.query.pageSize, 10) || 20;
      const result = await ddns?.getDDNSLogList(page, pageSize);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/ddns/history - 调和历史（从 hub-state）
  router.get('/history', async (req, res) => {
    try {
      const history = modules.stateManager?.getDDNSState?.()?.history || [];
      res.json({ history });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
