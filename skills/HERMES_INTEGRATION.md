# Hermes 集成指南

本文档说明如何在 Hermes 中调用 Auto-DDNS 的 skill 模块。

## 概述

Auto-DDNS 提供了 5 个独立的 skill 模块，每个模块都可以被 Hermes 单独导入和调用：

1. **device-monitor** - 设备监控和 IPv6 地址查询
2. **lucky-manager** - Lucky 反向代理、DDNS、SSL 证书管理
3. **cloudflare-dns** - Cloudflare DNS 记录管理
4. **sunpanel-sync** - SunPanel 导航面板同步
5. **service-registry** - 服务注册和发现

## 前置要求

### 环境变量配置

在调用这些 skill 之前，需要在 `.env` 文件中配置以下环境变量：

```bash
# 路由器 SSH 配置（device-monitor 需要）
ROUTER_HOST=192.168.9.1
ROUTER_USERNAME=root
ROUTER_PASSWORD=your_password

# Lucky API 配置（lucky-manager 需要）
LUCKY_API_BASE=http://192.168.9.2:16601
LUCKY_OPEN_TOKEN=your_lucky_token

# Cloudflare API 配置（cloudflare-dns 需要）
CF_API_TOKEN=your_cloudflare_token
CF_ZONE_ID=your_zone_id
CF_DOMAIN=your_domain.com

# 阿里云域名（可选）
ALIYUN_DOMAIN=leecaiy.shop
```

### 依赖安装

```bash
cd /path/to/auto-ddnns
npm install
```

## Hermes 配置

### 方式一：在 Hermes 配置文件中注册

```javascript
// hermes.config.js
export default {
  skills: [
    {
      name: 'device-monitor',
      path: '/path/to/auto-ddnns/skills/device-monitor',
      enabled: true,
      description: '设备监控和 IPv6 地址查询'
    },
    {
      name: 'lucky-manager',
      path: '/path/to/auto-ddnns/skills/lucky-manager',
      enabled: true,
      description: 'Lucky 反向代理管理'
    },
    {
      name: 'cloudflare-dns',
      path: '/path/to/auto-ddnns/skills/cloudflare-dns',
      enabled: true,
      description: 'Cloudflare DNS 管理'
    },
    {
      name: 'sunpanel-sync',
      path: '/path/to/auto-ddnns/skills/sunpanel-sync',
      enabled: true,
      description: 'SunPanel 同步'
    },
    {
      name: 'service-registry',
      path: '/path/to/auto-ddnns/skills/service-registry',
      enabled: true,
      description: '服务注册表'
    }
  ]
};
```

### 方式二：直接导入使用

```javascript
// 在 Hermes 代码中直接导入
import DeviceMonitor from '/path/to/auto-ddnns/skills/device-monitor/index.mjs';
import LuckyManager from '/path/to/auto-ddnns/skills/lucky-manager/index.mjs';
import CloudflareDNS from '/path/to/auto-ddnns/skills/cloudflare-dns/index.mjs';
import SunPanelSync from '/path/to/auto-ddnns/skills/sunpanel-sync/index.mjs';
import ServiceRegistry from '/path/to/auto-ddnns/skills/service-registry/index.mjs';
```

## Skill 使用示例

### 1. device-monitor - 设备监控

```javascript
import DeviceMonitor from './skills/device-monitor/index.mjs';

// 检查所有设备
const result = await DeviceMonitor.checkDevices();
console.log(`发现 ${result.totalDevices} 台设备`);

// 获取指定设备的 IPv6 地址
const ipv6 = await DeviceMonitor.getDeviceIPv6('10'); // 设备 ID: 192.168.9.10
console.log(`设备 IPv6: ${ipv6}`);

// 获取设备详细信息
const deviceInfo = await DeviceMonitor.getDeviceInfo('10');
console.log(deviceInfo);

// 获取所有设备列表
const devices = await DeviceMonitor.getAllDevices();

// 获取 IPv6 地址映射表
const ipv6Map = await DeviceMonitor.getIPv6Map();
// 返回: { '10': '240e:391:c8a:4071::3e0', '200': '240e:391:c8a:4071::1' }

// 获取监控状态
const status = await DeviceMonitor.getStatus();

// 生成端口映射对照表
const portMapping = await DeviceMonitor.generatePortMappingTable();
```

**可用方法：**
- `checkDevices()` - 检查所有设备并更新 IPv6 地址
- `getDeviceIPv6(deviceId)` - 获取指定设备的 IPv6 地址
- `getDeviceInfo(deviceId)` - 获取设备详细信息
- `getAllDevices()` - 获取所有设备列表
- `getIPv6Map()` - 获取 IPv6 地址映射表
- `getStatus()` - 获取监控状态摘要
- `generatePortMappingTable()` - 生成端口映射对照表

### 2. lucky-manager - Lucky 管理

```javascript
import LuckyManager from './skills/lucky-manager/index.mjs';

// ===== DDNS 管理 =====

// 列出所有 DDNS 任务
const ddnsList = await LuckyManager.listDDNS();

// 创建 DDNS 任务
const newTask = await LuckyManager.createDDNS({
  name: '我的域名',
  type: 'aliyun',
  domain: 'home.leecaiy.shop',
  accessKeyId: 'your_key',
  accessKeySecret: 'your_secret',
  ipv6: true
});

// 更新 DDNS 任务
await LuckyManager.updateDDNS('task_key', {
  name: '新名称',
  enabled: true
});

// 删除 DDNS 任务
await LuckyManager.deleteDDNS('task_key');

// ===== 端口和反向代理管理 =====

// 列出所有端口配置
const ports = await LuckyManager.listPorts();

// 创建端口监听和反向代理
const proxy = await LuckyManager.createPortListener({
  port: 55000,
  name: 'my-service',
  domain: 'app.leecaiy.shop',
  target: 'http://192.168.9.10:3000'
});

// 创建反向代理规则（智能创建或添加）
const proxyRule = await LuckyManager.createProxy({
  port: 55000,
  name: 'my-app',
  domain: 'app.leecaiy.shop',
  target: 'http://192.168.9.10:8080',
  options: {
    enableTLS: true,
    autoRedirect: true
  }
});

// 列出所有反向代理规则
const proxies = await LuckyManager.listProxies();

// ===== SSL 证书管理 =====

// 列出所有 SSL 证书
const certs = await LuckyManager.listSSL();

// 申请 SSL 证书
const cert = await LuckyManager.applySSL({
  domain: 'app.leecaiy.shop',
  email: 'your@email.com',
  provider: 'letsencrypt',
  dnsProvider: 'aliyun',
  accessKeyId: 'your_key',
  accessKeySecret: 'your_secret'
});

// ===== 批量操作 =====

// 批量创建 DDNS 任务
const tasks = [
  { name: 'home', domain: 'home.leecaiy.shop', type: 'aliyun' },
  { name: 'nas', domain: 'nas.leecaiy.shop', type: 'aliyun' }
];
const results = await LuckyManager.batchCreateDDNS(tasks);
```

**可用方法：**
- `listDDNS()` - 列出所有 DDNS 任务
- `createDDNS(params)` - 创建 DDNS 任务
- `updateDDNS(taskId, params)` - 更新 DDNS 任务
- `deleteDDNS(taskId)` - 删除 DDNS 任务
- `listPorts()` - 列出所有端口配置
- `createPortListener(params)` - 创建端口监听
- `deletePortListener(port)` - 删除端口监听（需要 Web 界面）
- `createProxy(params)` - 创建反向代理规则
- `deleteProxy(port, ruleName)` - 删除反向代理规则（需要 Web 界面）
- `listProxies()` - 列出所有反向代理规则
- `applySSL(certConfig)` - 申请 SSL 证书
- `listSSL()` - 列出所有 SSL 证书
- `batchCreateDDNS(tasks)` - 批量创建 DDNS 任务

### 3. cloudflare-dns - Cloudflare DNS 管理

```javascript
import CloudflareDNS from './skills/cloudflare-dns/index.mjs';

// 列出所有 DNS 记录
const records = await CloudflareDNS.listRecords();

// 列出指定类型的记录
const aRecords = await CloudflareDNS.listRecords({ type: 'A' });
const aaaaRecords = await CloudflareDNS.listRecords({ type: 'AAAA' });

// 创建 DNS 记录
const newRecord = await CloudflareDNS.createRecord({
  type: 'A',
  name: 'home.leecaiy.shop',
  content: '1.2.3.4',
  ttl: 1,
  proxied: false
});

// 更新 DNS 记录
await CloudflareDNS.updateRecord({
  recordId: 'record_id',
  type: 'A',
  name: 'home.leecaiy.shop',
  content: '5.6.7.8',
  ttl: 1,
  proxied: false
});

// 删除 DNS 记录
await CloudflareDNS.deleteRecord('record_id');

// 更新 DDNS（自动创建或更新 A/AAAA 记录）
const ddnsResult = await CloudflareDNS.updateDDNS({
  subdomain: 'home',
  ipv4: '1.2.3.4',
  ipv6: '240e:391:c8a:4071::3e0'
});

// 批量更新设备的 DDNS
const devices = [
  { id: 'nas', subdomain: 'nas', ipv4: '192.168.9.2', ipv6: '240e::1' },
  { id: 'router', subdomain: 'router', ipv4: '192.168.9.1', ipv6: '240e::2' }
];
const batchResults = await CloudflareDNS.batchUpdateDDNS(devices);
```

**可用方法：**
- `listRecords(params)` - 列出 DNS 记录
- `createRecord(params)` - 创建 DNS 记录
- `updateRecord(params)` - 更新 DNS 记录
- `deleteRecord(recordId)` - 删除 DNS 记录
- `updateDDNS(params)` - 更新 DDNS（自动创建或更新）
- `batchUpdateDDNS(devices)` - 批量更新设备 DDNS

### 4. sunpanel-sync - SunPanel 同步

```javascript
import SunPanelSync from './skills/sunpanel-sync/index.mjs';

// 同步所有 Lucky 反向代理规则
const result = await SunPanelSync.syncFromLucky();
console.log(`获取到 ${result.totalRules} 条反向代理规则`);

// 同步指定端口的规则
const result443 = await SunPanelSync.syncFromLucky({ port: 443 });
const result55000 = await SunPanelSync.syncFromLucky({ port: 55000 });

// 手动添加服务（待实现）
// const service = await SunPanelSync.addService({
//   name: '我的服务',
//   url: 'https://app.leecaiy.shop',
//   icon: 'https://app.leecaiy.shop/favicon.ico',
//   description: '服务描述',
//   category: '工具'
// });

// 批量同步
const services = [
  { name: 'https', port: 443 },
  { name: 'http', port: 80 },
  { name: 'lucky', port: 55000 }
];
const batchResults = await SunPanelSync.batchSync(services);
```

**可用方法：**
- `syncFromLucky(params)` - 从 Lucky 同步反向代理规则
- `addService(params)` - 手动添加服务（待实现）
- `batchSync(services)` - 批量同步服务

**注意：** 实际的 SunPanel 同步功能需要通过 Central Hub 的 SunPanelManager 模块实现。此 skill 主要用于获取 Lucky 的反向代理规则列表。

### 5. service-registry - 服务注册表

```javascript
import ServiceRegistry from './skills/service-registry/index.mjs';

// 列出所有服务
const services = await ServiceRegistry.list();
console.log(`共有 ${services.length} 个服务`);

// 获取指定服务
const service = await ServiceRegistry.get('central-hub');

// 注册新服务
const newService = await ServiceRegistry.register({
  id: 'my-app',
  name: '我的应用',
  device: '10',
  internalPort: 3000,
  domainPrefix: 'myapp',
  description: '我的应用服务',
  sunpanel: {
    group: '应用',
    icon: 'https://myapp.leecaiy.shop/favicon.ico'
  }
});

// 更新服务
await ServiceRegistry.update('my-app', {
  name: '我的应用（新）',
  description: '更新后的描述'
});

// 注销服务
await ServiceRegistry.unregister('my-app');

// 批量注册服务
const newServices = [
  { id: 'app1', name: 'App 1', device: '10', internalPort: 8080 },
  { id: 'app2', name: 'App 2', device: '10', internalPort: 8081 }
];
const batchResults = await ServiceRegistry.batchRegister(newServices);

// 验证服务配置
const validation = await ServiceRegistry.validate({
  id: 'test-app',
  name: 'Test App',
  device: '10',
  internalPort: 3000
});
if (!validation.valid) {
  console.error('验证失败:', validation.errors);
}
```

**可用方法：**
- `list(params)` - 列出所有服务
- `get(serviceId)` - 获取指定服务详情
- `register(params)` - 注册新服务
- `unregister(serviceId)` - 注销服务
- `update(serviceId, updates)` - 更新服务
- `batchRegister(services)` - 批量注册服务
- `validate(service)` - 验证服务配置

## 完整工作流示例

以下是一个完整的工作流，展示如何组合使用多个 skill：

```javascript
import DeviceMonitor from './skills/device-monitor/index.mjs';
import CloudflareDNS from './skills/cloudflare-dns/index.mjs';
import LuckyManager from './skills/lucky-manager/index.mjs';
import ServiceRegistry from './skills/service-registry/index.mjs';

async function setupNewService() {
  // 1. 发现设备并获取 IPv6
  console.log('步骤 1: 发现设备...');
  await DeviceMonitor.checkDevices();
  const ipv6Map = await DeviceMonitor.getIPv6Map();
  const nasIPv6 = ipv6Map['10']; // 192.168.9.10 的 IPv6
  console.log(`NAS IPv6: ${nasIPv6}`);

  // 2. 更新 Cloudflare DNS
  console.log('步骤 2: 更新 Cloudflare DNS...');
  await CloudflareDNS.updateDDNS({
    subdomain: 'nas',
    ipv4: '192.168.9.10',
    ipv6: nasIPv6
  });

  // 3. 配置 Lucky 反向代理
  console.log('步骤 3: 配置 Lucky 反向代理...');
  await LuckyManager.createProxy({
    port: 55000,
    name: 'nas-service',
    domain: 'nas.leecaiy.shop',
    target: `http://[${nasIPv6}]:5000`,
    options: {
      enableTLS: true,
      autoRedirect: true
    }
  });

  // 4. 申请 SSL 证书
  console.log('步骤 4: 申请 SSL 证书...');
  await LuckyManager.applySSL({
    domain: 'nas.leecaiy.shop',
    email: 'admin@leecaiy.shop',
    provider: 'letsencrypt',
    dnsProvider: 'aliyun'
  });

  // 5. 注册服务
  console.log('步骤 5: 注册服务...');
  await ServiceRegistry.register({
    id: 'nas',
    name: 'NAS',
    device: '10',
    ipv6: nasIPv6,
    internalPort: 5000,
    domainPrefix: 'nas',
    description: 'Network Attached Storage',
    sunpanel: {
      group: '存储',
      icon: 'https://nas.leecaiy.shop/favicon.ico'
    }
  });

  console.log('✅ 服务配置完成！');
}

// 执行工作流
setupNewService().catch(console.error);
```

## 错误处理

所有 skill 方法都可能抛出异常，建议使用 try-catch 进行错误处理：

```javascript
try {
  const devices = await DeviceMonitor.checkDevices();
  console.log('设备检查成功:', devices);
} catch (error) {
  console.error('设备检查失败:', error.message);
  // 处理错误...
}
```

## 测试

运行测试脚本验证所有 skill 功能：

```bash
cd /path/to/auto-ddnns
node test-skills.mjs
```

## 注意事项

1. **环境变量**：确保所有必需的环境变量都已正确配置
2. **网络访问**：确保 Hermes 可以访问路由器、Lucky、Cloudflare 等服务
3. **权限**：某些操作（如 SSH 连接）需要相应的权限
4. **并发**：避免同时对同一资源进行多次操作
5. **错误处理**：始终使用 try-catch 处理可能的异常
6. **日志**：skill 会输出日志信息，建议配置日志收集

## 技术支持

- 项目地址：`/vol1/1000/code/auto-ddnns`
- 文档：`skills/README.md`
- 示例：`skills/EXAMPLES.md`
- 测试：`test-skills.mjs`

## 更新日志

- **2026-05-01**: 初始版本，所有 5 个 skill 模块测试通过
