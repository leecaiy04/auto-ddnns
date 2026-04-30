# Skills 使用示例

本文档展示如何在 Hermes 或其他应用中调用 Auto-DDNS 的各个 skill。

## 1. 设备监控 (device-monitor)

```javascript
import DeviceMonitor from './skills/device-monitor/index.mjs';

// 发现所有设备
const devices = await DeviceMonitor.discoverDevices();
console.log(`发现 ${devices.length} 台设备`);

// 获取指定设备信息
const device = await DeviceMonitor.getDeviceInfo('192.168.9.10');
console.log(`设备 ${device.ip} 的 IPv6: ${device.ipv6}`);

// 健康检查
const health = await DeviceMonitor.checkHealth('192.168.9.10');
console.log(`设备状态: ${health.status}`);
```

## 2. Lucky 管理 (lucky-manager)

```javascript
import LuckyManager from './skills/lucky-manager/index.mjs';

// DDNS 管理
const ddns = await LuckyManager.createDDNS({
  name: '我的域名',
  domain: 'home.example.com',
  type: 'cloudflare',
  ipv6: true
});

// 端口监听
const port = await LuckyManager.createPort({
  port: 8080,
  protocol: 'tcp',
  target: '192.168.9.10:80'
});

// 反向代理
const proxy = await LuckyManager.createProxy({
  domain: 'app.example.com',
  target: 'http://192.168.9.10:3000'
});

// SSL 证书
const cert = await LuckyManager.applyCertificate({
  domain: 'app.example.com',
  provider: 'letsencrypt'
});
```

## 3. Cloudflare DNS (cloudflare-dns)

```javascript
import CloudflareDNS from './skills/cloudflare-dns/index.mjs';

// 更新 DDNS
const result = await CloudflareDNS.updateDDNS({
  subdomain: 'home',
  ipv4: '1.2.3.4',
  ipv6: '240e:391:c8a:4071::3e0'
});

// 批量更新设备
const devices = [
  { id: 'nas', subdomain: 'nas', ipv4: '192.168.9.2', ipv6: '240e::1' },
  { id: 'router', subdomain: 'router', ipv4: '192.168.9.1', ipv6: '240e::2' }
];
const results = await CloudflareDNS.batchUpdateDDNS(devices);
```

## 4. SunPanel 同步 (sunpanel-sync)

```javascript
import SunPanelSync from './skills/sunpanel-sync/index.mjs';

// 同步所有 Lucky 反向代理规则
const result = await SunPanelSync.syncFromLucky();
console.log(`同步了 ${result.synced} 个服务`);

// 同步指定端口
const result443 = await SunPanelSync.syncFromLucky({ port: 443 });
```

## 5. 服务注册 (service-registry)

```javascript
import ServiceRegistry from './skills/service-registry/index.mjs';

// 注册服务
await ServiceRegistry.register({
  name: 'my-app',
  url: 'https://app.example.com',
  type: 'web',
  metadata: { version: '1.0.0', port: 3000 }
});

// 列出所有服务
const services = await ServiceRegistry.list();

// 批量注册
const newServices = [
  { name: 'app1', url: 'https://app1.com', type: 'web' },
  { name: 'app2', url: 'https://app2.com', type: 'api' }
];
await ServiceRegistry.batchRegister(newServices);
```

## 完整工作流示例

```javascript
// 1. 发现设备并获取 IPv6
const devices = await DeviceMonitor.discoverDevices();
const targetDevice = devices.find(d => d.ip === '192.168.9.10');

// 2. 更新 Cloudflare DNS
await CloudflareDNS.updateDDNS({
  subdomain: 'nas',
  ipv4: targetDevice.ip,
  ipv6: targetDevice.ipv6
});

// 3. 配置 Lucky 反向代理
await LuckyManager.createProxy({
  domain: 'nas.example.com',
  target: `http://${targetDevice.ip}:5000`
});

// 4. 申请 SSL 证书
await LuckyManager.applyCertificate({
  domain: 'nas.example.com',
  provider: 'letsencrypt'
});

// 5. 同步到 SunPanel
await SunPanelSync.syncFromLucky({ port: 443 });

// 6. 注册服务
await ServiceRegistry.register({
  name: 'NAS',
  url: 'https://nas.example.com',
  type: 'storage',
  metadata: { device: targetDevice.ip }
});
```

## 在 Hermes 中使用

如果你在 Hermes 中调用这些 skills，可以这样配置：

```javascript
// hermes-config.js
export default {
  skills: [
    {
      name: 'device-monitor',
      path: '/path/to/auto-ddnns/skills/device-monitor',
      enabled: true
    },
    {
      name: 'lucky-manager',
      path: '/path/to/auto-ddnns/skills/lucky-manager',
      enabled: true
    },
    {
      name: 'cloudflare-dns',
      path: '/path/to/auto-ddnns/skills/cloudflare-dns',
      enabled: true
    }
  ]
};
```

然后在 Hermes 中调用：

```javascript
// 在 Hermes 中
const result = await hermes.callSkill('device-monitor', 'discoverDevices');
```
