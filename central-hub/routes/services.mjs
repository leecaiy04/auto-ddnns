/**
 * Services 路由
 * 提供服务清单管理 API
 */

import express from 'express';

export function serviceRoutes(modules) {
  const router = express.Router();

  /**
   * 获取所有服务
   */
  router.get('/list', (req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }

      const services = modules.serviceRegistry.getAllServices();
      res.json(services);
    } catch (error) {
      console.error('[Services] 获取服务列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 获取服务状态
   */
  router.get('/status', (req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }

      const status = modules.serviceRegistry.getStatus();
      res.json(status);
    } catch (error) {
      console.error('[Services] 获取服务状态失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 添加新服务
   */
  router.post('/add', async (req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }

      const service = req.body;

      // 验证服务配置
      const validation = modules.serviceRegistry.validateService(service);
      if (!validation.valid) {
        return res.status(400).json({ error: '配置验证失败', details: validation.errors });
      }

      const newService = await modules.serviceRegistry.addService(service);
      res.json(newService);
    } catch (error) {
      console.error('[Services] 添加服务失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 更新服务
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }

      const updatedService = await modules.serviceRegistry.updateService(id, updates);
      res.json(updatedService);
    } catch (error) {
      console.error('[Services] 更新服务失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 删除服务
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }

      await modules.serviceRegistry.deleteService(id);
      res.json({ success: true });
    } catch (error) {
      console.error('[Services] 删除服务失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
