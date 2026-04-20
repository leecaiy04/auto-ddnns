/**
 * 变更日志路由
 * 提供审计日志查询 API
 */

import express from 'express';

export function changelogRoutes(modules) {
  const router = express.Router();

  /**
   * 获取变更日志列表
   * GET /api/changelog?action=add_service&limit=50&offset=0
   */
  router.get('/', (req, res) => {
    try {
      if (!modules.changelogManager) {
        return res.status(503).json({ error: '变更日志模块未初始化' });
      }

      const { action, target, limit, offset } = req.query;
      const filter = {};
      if (action) filter.action = action;
      if (target) filter.target = target;
      if (limit) filter.limit = parseInt(limit, 10);
      if (offset) filter.offset = parseInt(offset, 10);

      const result = modules.changelogManager.getAll(filter);
      res.json(result);
    } catch (error) {
      console.error('[Changelog] 获取变更日志失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 导出完整日志
   * GET /api/changelog/export
   */
  router.get('/export', (req, res) => {
    try {
      if (!modules.changelogManager) {
        return res.status(503).json({ error: '变更日志模块未初始化' });
      }

      const data = modules.changelogManager.exportJSON();
      res.json(data);
    } catch (error) {
      console.error('[Changelog] 导出变更日志失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default changelogRoutes;
