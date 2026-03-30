/**
 * Devices 路由
 * 提供设备管理 API
 */

import express from 'express';

export function deviceRoutes(modules) {
  const router = express.Router();

  /**
   * 获取所有设备列表
   */
  router.get('/list', (req, res) => {
    try {
      if (!modules.deviceMonitor) {
        return res.status(503).json({ error: '设备监控模块未初始化' });
      }

      const devices = modules.deviceMonitor.getAllDevices();
      res.json(devices);
    } catch (error) {
      console.error('[Devices] 获取设备列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 获取指定设备信息
   */
  router.get('/:deviceId', (req, res) => {
    try {
      const { deviceId } = req.params;

      if (!modules.deviceMonitor) {
        return res.status(503).json({ error: '设备监控模块未初始化' });
      }

      const device = modules.deviceMonitor.getDeviceInfo(deviceId);
      if (!device) {
        return res.status(404).json({ error: '设备不存在' });
      }

      res.json(device);
    } catch (error) {
      console.error('[Devices] 获取设备信息失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 刷新设备IPv6地址
   */
  router.post('/refresh', async (req, res) => {
    try {
      if (!modules.deviceMonitor) {
        return res.status(503).json({ error: '设备监控模块未初始化' });
      }

      const result = await modules.deviceMonitor.checkDevices();
      res.json(result);
    } catch (error) {
      console.error('[Devices] 刷新设备失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 获取端口映射对照表
   */
  router.get('/port-mapping-table', (req, res) => {
    try {
      if (!modules.deviceMonitor) {
        return res.status(503).json({ error: '设备监控模块未初始化' });
      }

      const table = modules.deviceMonitor.generatePortMappingTable();
      res.json(table);
    } catch (error) {
      console.error('[Devices] 获取端口映射表失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
