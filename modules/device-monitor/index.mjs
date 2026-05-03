/**
 * 设备监控模块
 * 支持通过 SSH 或 iKuai API 查询设备的 IPv6 地址，更新设备状态
 */

import { buildDeviceAddressMap as buildDeviceAddressMapSSH } from './ssh-client.mjs';
import { getDeviceIPv6Addresses, chooseBestIPv6 as chooseBestIPv6SSH } from './ssh-client.mjs';
import { createIKuaiClient } from './ikuai-client.mjs';
import { getEnv } from '../../shared/env-loader.mjs';

const PUBLIC_DOMAIN = getEnv('ALIYUN_DOMAIN', 'leecaiy.shop');

export class DeviceMonitor {
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
    this.routerType = getEnv('ROUTER_TYPE', 'ssh').toLowerCase();
    this.router = {
      host: getEnv('ROUTER_HOST', config.router?.host || '192.168.9.1'),
      username: getEnv('ROUTER_USERNAME', config.router?.username || 'root'),
      password: getEnv('ROUTER_PASSWORD', ''),
      sslVerify: getEnv('ROUTER_SSL_VERIFY', '1') !== '0',
      timeout: config.router?.timeout || 10000
    };
    
    this.directQueryDevices = this.parseDirectQueryDevices();
  }

  parseDirectQueryDevices() {
    const config = getEnv('DIRECT_QUERY_DEVICES', '');
    if (!config) return new Map();
    
    const devices = new Map();
    const entries = config.split(',').map(s => s.trim()).filter(s => s);
    
    for (const entry of entries) {
      const parts = entry.split(':');
      if (parts.length >= 3) {
        const [deviceId, username, password] = parts;
        devices.set(deviceId, { username, password });
      }
    }
    
    return devices;
  }

  async init() {
    console.log('[DeviceMonitor] 初始化设备监控模块...');
    console.log('[DeviceMonitor] 路由器类型: ' + this.routerType);
    
    if (this.directQueryDevices.size > 0) {
      const deviceIds = Array.from(this.directQueryDevices.keys()).join(', ');
      console.log('[DeviceMonitor] 直接查询设备: ' + deviceIds);
    }

    if (!this.router.password) {
      console.warn('[DeviceMonitor] 路由器密码未设置');
    }

    if (!this.stateManager.state.devices) {
      this.stateManager.state.devices = {
        lastUpdate: null,
        devices: {},
        ipv6Map: {}
      };
    }

    console.log('[DeviceMonitor] 设备监控模块初始化完成');
  }

  async buildDeviceAddressMap() {
    if (this.routerType === 'ikuai') {
      return await this.buildDeviceAddressMapIKuai();
    } else {
      return await buildDeviceAddressMapSSH(this.router);
    }
  }

  async buildDeviceAddressMapIKuai() {
    const client = createIKuaiClient(this.router);
    const macDeviceMap = await client.buildDeviceAddressMap();

    const ipDeviceMap = new Map();

    for (const [mac, device] of macDeviceMap.entries()) {
      if (device.ipv4) {
        const deviceId = device.ipv4.split('.').pop();
        
        let ipv6Addresses = device.ipv6;
        let queryMethod = 'router-api';
        
        if (this.directQueryDevices.has(deviceId)) {
          const credentials = this.directQueryDevices.get(deviceId);
          console.log(`[DeviceMonitor] 尝试直接查询设备 ${deviceId} (${device.ipv4})...`);

          try {
            const directAddresses = await getDeviceIPv6Addresses(device.ipv4, {
              username: credentials.username,
              password: credentials.password,
              timeout: this.router.timeout
            });

            if (directAddresses.length > 0) {
              ipv6Addresses = directAddresses;
              queryMethod = 'direct-ssh';
              console.log(`[DeviceMonitor] ✅ 设备 ${deviceId} SSH 查询成功: ${directAddresses.length} 个 IPv6 地址`);
            } else {
              console.log(`[DeviceMonitor] ⚠️  设备 ${deviceId} SSH 查询返回空结果，使用路由器数据`);
            }
          } catch (error) {
            console.warn(`[DeviceMonitor] ⚠️  设备 ${deviceId} SSH 查询失败: ${error.message}，降级使用路由器数据`);
            // 继续使用路由器 API 获取的 IPv6 地址
          }
        }
        
        const bestIpv6 = chooseBestIPv6SSH(ipv6Addresses);

        ipDeviceMap.set(device.ipv4, {
          ipv4: device.ipv4,
          mac: device.mac,
          ipv6: bestIpv6,
          ipv6State: bestIpv6 ? 'REACHABLE' : null,
          ipv6Interface: device.interface || 'unknown',
          queryMethod
        });
      }
    }

    return ipDeviceMap;
  }

  chooseBestIPv6(ipv6List) {
    if (!ipv6List || ipv6List.length === 0) {
      return null;
    }

    const globalAddresses = ipv6List.filter(ip => !ip.toLowerCase().startsWith('fe80:'));

    if (globalAddresses.length === 0) {
      return ipv6List[0];
    }

    const eui64Address = globalAddresses.find(ip => ip.toLowerCase().includes('ff:fe'));
    if (eui64Address) {
      return eui64Address;
    }

    return globalAddresses[0];
  }

  async checkDevices() {
    if (!this.router.password) {
      console.warn('[DeviceMonitor] 路由器密码未设置');
      return {
        success: false,
        message: '路由器密码未设置'
      };
    }

    try {
      console.log('[DeviceMonitor] 开始检查设备IPv6地址...');

      const deviceMap = await this.buildDeviceAddressMap();

      const devices = {};
      const ipv6Map = {};

      for (const [ipv4, info] of deviceMap.entries()) {
        const deviceId = ipv4.split('.').pop();

        devices[deviceId] = {
          ipv4,
          ipv6: info.ipv6,
          mac: info.mac,
          ipv6State: info.ipv6State,
          ipv6Interface: info.ipv6Interface,
          queryMethod: info.queryMethod,
          lastSeen: new Date().toISOString()
        };

        if (info.ipv6) {
          ipv6Map[deviceId] = info.ipv6;
        }
      }

      this.stateManager.state.devices = {
        lastUpdate: new Date().toISOString(),
        devices,
        ipv6Map,
        totalDevices: Object.keys(devices).length,
        ipv6Ready: Object.values(devices).filter(d => d.ipv6).length
      };

      await this.stateManager.save();

      console.log('[DeviceMonitor] 完成: ' + Object.keys(devices).length + ' 设备, ' + Object.values(devices).filter(d => d.ipv6).length + ' IPv6');

      return {
        success: true,
        totalDevices: Object.keys(devices).length,
        ipv6Ready: Object.values(devices).filter(d => d.ipv6).length,
        devices
      };
    } catch (error) {
      console.error('[DeviceMonitor] 失败:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }

  getDeviceIPv6(deviceId) {
    return this.stateManager.state.devices?.ipv6Map?.[deviceId] || null;
  }

  getDeviceInfo(deviceId) {
    return this.stateManager.state.devices?.devices?.[deviceId] || null;
  }

  getAllDevices() {
    const devices = this.stateManager.state.devices?.devices || {};
    return Object.entries(devices).map(([id, info]) => ({
      id,
      ...info
    }));
  }

  getIPv6Map() {
    return this.stateManager.state.devices?.ipv6Map || {};
  }

  getStatus() {
    const devices = this.stateManager.state.devices;
    return {
      lastUpdate: devices?.lastUpdate || null,
      totalDevices: devices?.totalDevices || 0,
      ipv6Ready: devices?.ipv6Ready || 0,
      enabled: this.config.enabled
    };
  }

  generatePortMappingTable() {
    const devices = this.getAllDevices();
    const ipv6Map = this.getIPv6Map();

    const table = {
      lastUpdate: new Date().toISOString(),
      entries: devices.map(device => ({
        deviceId: device.id,
        ipv4: device.ipv4,
        ipv6: device.ipv6,
        mac: device.mac,
        domain: device.ipv6 ? device.id + '.v6.' + PUBLIC_DOMAIN : null,
        ready: !!device.ipv6
      }))
    };

    return table;
  }
}

export default DeviceMonitor;
