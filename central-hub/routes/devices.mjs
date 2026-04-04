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
      
      // Expand devices with DDNS domains
      const ddnsDomains = modules.config?.modules?.ddns?.domains?.ipv6 || [];
      const enrichedDevices = devices.map(device => {
        let ddnsDomain = null;
        if (device.ipv6) {
          const deviceId = device.device || device.ipv4?.split('.').pop();
          if (deviceId) {
            ddnsDomain = ddnsDomains.find(domain => domain.startsWith(`${deviceId}.v6.`));
          }
        }
        return { ...device, ddnsDomain };
      });
      
      res.json(enrichedDevices);
    } catch (error) {
      console.error('[Devices] 获取设备列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 自动发现开放端口
   */
  router.get('/scan-ports', async (req, res) => {
    try {
      if (!modules.deviceMonitor) {
        return res.status(503).json({ error: '设备监控模块未初始化' });
      }

      const devices = modules.deviceMonitor.getAllDevices();
      const COMMON_PORTS = [80, 443, 5000, 5001, 8006, 5666, 20000, 20001, 33100, 52000, 48014, 58842, 45683, 40042, 38280, 24377, 40002, 49665, 53080, 54396, 18789, 38357, 5105, 13005, 21001, 8080];
      const net = await import('net');
      
      const checkPort = (host, port) => {
        return new Promise((resolve) => {
          const socket = new net.Socket();
          socket.setTimeout(400); 
          let isOpen = false;
          
          socket.on('connect', () => {
            isOpen = true;
            socket.destroy();
          });
          
          socket.on('timeout', () => {
             socket.destroy();
          });
          
          socket.on('error', () => {
             // connection refused
          });
          
          socket.on('close', () => {
             resolve(isOpen);
          });
          
          socket.connect(port, host);
        });
      };
      
      const scanResults = [];
      const registeredServices = modules.serviceRegistry ? modules.serviceRegistry.getAllServices() : [];
      
      for (const d of devices) {
        if (!d.ipv4) continue;
        const deviceId = d.id || d.device || d.ipv4.split('.').pop();
        
        const portChecks = COMMON_PORTS.map(async (port) => {
           // Skip if already in database
           const isRegistered = registeredServices.some(s => String(s.device) === String(deviceId) && Number(s.internalPort) === port);
           if (isRegistered) return null;
           
           const isOpen = await checkPort(d.ipv4, port);
           if (isOpen) {
             return {
               device: deviceId,
               ipv4: d.ipv4,
               port,
               suggestedProtocol: [443, 5001, 8006].includes(port) ? 'https' : 'http'
             };
           }
           return null;
        });
        
        const results = await Promise.all(portChecks);
        scanResults.push(...results.filter(Boolean));
      }
      
      res.json(scanResults);
      
    } catch (error) {
       console.error('[Devices] 端口扫描失败:', error);
       res.status(500).json({ error: error.message });
    }
  });

  /**
   * 扫描指定关键机器的端口
   * POST /api/devices/:id/scan
   */
  router.post('/:deviceId/scan', async (req, res) => {
    try {
      if (!modules.deviceMonitor) {
        return res.status(503).json({ error: '设备监控模块未初始化' });
      }

      const { deviceId } = req.params;
      const { ports } = req.body; // optional custom port list

      // Get device info
      const device = modules.deviceMonitor.getDeviceInfo(deviceId);
      const deviceConfig = modules.serviceRegistry?.getDeviceById(deviceId);
      
      if (!device && !deviceConfig) {
        return res.status(404).json({ error: `设备 ${deviceId} 不存在` });
      }

      const ipv4 = device?.ipv4 || deviceConfig?.ipv4 || `192.168.3.${deviceId}`;

      const COMMON_PORTS = ports || [80, 443, 3000, 5000, 5001, 5122, 5666, 8006, 8080, 8443, 9090, 13005, 16601, 18789, 20000, 20001, 21001, 24377, 31568, 33100, 38280, 38357, 40002, 40003, 40031, 40042, 45678, 45683, 48014, 49665, 50000, 50001, 51100, 52000, 53080, 54396, 58841, 58842];
      const net = await import('net');

      const checkPort = (host, port) => {
        return new Promise((resolve) => {
          const socket = new net.Socket();
          socket.setTimeout(500);
          let isOpen = false;
          socket.on('connect', () => { isOpen = true; socket.destroy(); });
          socket.on('timeout', () => { socket.destroy(); });
          socket.on('error', () => {});
          socket.on('close', () => { resolve(isOpen); });
          socket.connect(port, host);
        });
      };

      const registeredServices = modules.serviceRegistry?.getServicesByDevice(deviceId) || [];
      const openPorts = [];

      const portChecks = COMMON_PORTS.map(async (port) => {
        const isOpen = await checkPort(ipv4, port);
        if (isOpen) {
          const isRegistered = registeredServices.some(s => Number(s.internalPort) === port);
          const protocol = [443, 5001, 8006, 8443, 9443].includes(port) ? 'https' : 'http';
          openPorts.push({
            port,
            protocol,
            isRegistered,
            registeredService: isRegistered ? registeredServices.find(s => Number(s.internalPort) === port)?.id : null
          });
        }
      });

      await Promise.all(portChecks);
      openPorts.sort((a, b) => a.port - b.port);

      modules.changelogManager?.append('scan_device', deviceId, `扫描设备 ${deviceId} (${ipv4}), 发现 ${openPorts.length} 个开放端口`);

      res.json({
        deviceId,
        ipv4,
        deviceName: deviceConfig?.name || `Device ${deviceId}`,
        isKeyMachine: deviceConfig?.isKeyMachine || false,
        scannedAt: new Date().toISOString(),
        openPorts
      });
    } catch (error) {
      console.error('[Devices] 单设备端口扫描失败:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * 获取关键机器列表
   * GET /api/devices/key-machines
   */
  router.get('/key-machines', (_req, res) => {
    try {
      if (!modules.serviceRegistry) {
        return res.status(503).json({ error: '服务清单模块未初始化' });
      }
      const keyMachines = modules.serviceRegistry.getKeyMachines();
      const ipv6Map = modules.deviceMonitor?.getIPv6Map() || {};
      
      const enriched = keyMachines.map(machine => ({
        ...machine,
        ipv6: ipv6Map[machine.id] || null,
        servicesCount: modules.serviceRegistry.getServicesByDevice(machine.id).length
      }));
      
      res.json(enriched);
    } catch (error) {
      console.error('[Devices] 获取关键机器列表失败:', error);
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
