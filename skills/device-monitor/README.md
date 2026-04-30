# Device Monitor Skill

设备监控 Skill，提供设备 IPv6 地址查询和监控功能。

## 功能概述

- 通过 SSH 连接路由器查询设备的 IPv6 地址
- 获取设备的 IPv4、IPv6、MAC 地址信息
- 生成设备端口映射对照表
- 监控设备在线状态

## 安装和配置

### 环境变量

在 `.env` 文件中配置以下变量：

```bash
# 路由器配置
ROUTER_HOST=192.168.9.1
ROUTER_USERNAME=root
ROUTER_PASSWORD=your_password

# 公网域名（用于生成设备域名）
ALIYUN_DOMAIN=leecaiy.shop
```

### 依赖模块

- `device-monitor` - 设备监控核心模块
- `state-manager` - 状态管理器
- `ssh-client` - SSH 客户端

## API 文档

### checkDevices()

检查所有设备的 IPv6 地址。

**参数：** 无

**返回值：**
```javascript
{
  success: true,
  totalDevices: 5,
  ipv6Ready: 4,
  devices: {
    "10": {
      ipv4: "192.168.9.10",
      ipv6: "240e:391:c8a:4071::3e0",
      mac: "aa:bb:cc:dd:ee:10",
      lastSeen: "2026-05-01T00:00:00.000Z"
    },
    // ...
  }
}
```

**示例：**
```javascript
import deviceMonitor from './skills/device-monitor/index.mjs';

const result = await deviceMonitor.checkDevices();
console.log(`发现 ${result.totalDevices} 个设备，${result.ipv6Ready} 个有 IPv6`);
```

---

### getDeviceIPv6(deviceId)

获取指定设备的 IPv6 地址。

**参数：**
- `deviceId` (string) - 设备 ID（IP 最后一位，如 "10", "200"）

**返回值：** `string | null` - IPv6 地址或 null

**示例：**
```javascript
const ipv6 = await deviceMonitor.getDeviceIPv6('10');
console.log('Device 10 IPv6:', ipv6);
// 输出: Device 10 IPv6: 240e:391:c8a:4071::3e0
```

---

### getDeviceInfo(deviceId)

获取指定设备的完整信息。

**参数：**
- `deviceId` (string) - 设备 ID

**返回值：**
```javascript
{
  ipv4: "192.168.9.10",
  ipv6: "240e:391:c8a:4071::3e0",
  mac: "aa:bb:cc:dd:ee:10",
  ipv6State: "REACHABLE",
  ipv6Interface: "br0",
  lastSeen: "2026-05-01T00:00:00.000Z"
}
```

**示例：**
```javascript
const info = await deviceMonitor.getDeviceInfo('10');
console.log('Device info:', info);
```

---

### getAllDevices()

获取所有设备列表。

**参数：** 无

**返回值：** `Array<object>` - 设备列表

**示例：**
```javascript
const devices = await deviceMonitor.getAllDevices();
devices.forEach(device => {
  console.log(`${device.id}: ${device.ipv4} -> ${device.ipv6}`);
});
```

---

### getIPv6Map()

获取 IPv6 地址映射表。

**参数：** 无

**返回值：**
```javascript
{
  "10": "240e:391:c8a:4071::3e0",
  "200": "240e:391:c8a:4071::c39",
  "201": "240e:391:c8a:4071::f6d"
}
```

**示例：**
```javascript
const ipv6Map = await deviceMonitor.getIPv6Map();
console.log('IPv6 Map:', ipv6Map);
```

---

### getStatus()

获取设备监控状态摘要。

**参数：** 无

**返回值：**
```javascript
{
  lastUpdate: "2026-05-01T00:00:00.000Z",
  totalDevices: 5,
  ipv6Ready: 4,
  enabled: true
}
```

**示例：**
```javascript
const status = await deviceMonitor.getStatus();
console.log('Monitor status:', status);
```

---

### generatePortMappingTable()

生成端口映射对照表。

**参数：** 无

**返回值：**
```javascript
{
  lastUpdate: "2026-05-01T00:00:00.000Z",
  entries: [
    {
      deviceId: "10",
      ipv4: "192.168.9.10",
      ipv6: "240e:391:c8a:4071::3e0",
      mac: "aa:bb:cc:dd:ee:10",
      domain: "10.v6.leecaiy.shop",
      ready: true
    },
    // ...
  ]
}
```

**示例：**
```javascript
const table = await deviceMonitor.generatePortMappingTable();
console.log('Port mapping table:', table);
```

## Hermes 集成示例

### 示例 1：查询设备 IPv6

```javascript
// Hermes 调用示例
async function queryDeviceIPv6(deviceId) {
  const skill = await import('./skills/device-monitor/index.mjs');
  const ipv6 = await skill.getDeviceIPv6(deviceId);
  
  if (ipv6) {
    return `设备 ${deviceId} 的 IPv6 地址是: ${ipv6}`;
  } else {
    return `设备 ${deviceId} 没有 IPv6 地址`;
  }
}

// 调用
const result = await queryDeviceIPv6('10');
console.log(result);
```

### 示例 2：检查所有设备

```javascript
async function checkAllDevices() {
  const skill = await import('./skills/device-monitor/index.mjs');
  const result = await skill.checkDevices();
  
  return {
    message: `发现 ${result.totalDevices} 个设备，${result.ipv6Ready} 个有 IPv6`,
    devices: result.devices
  };
}
```

### 示例 3：生成设备报告

```javascript
async function generateDeviceReport() {
  const skill = await import('./skills/device-monitor/index.mjs');
  
  const devices = await skill.getAllDevices();
  const status = await skill.getStatus();
  
  const report = {
    summary: {
      total: status.totalDevices,
      ipv6Ready: status.ipv6Ready,
      lastUpdate: status.lastUpdate
    },
    devices: devices.map(d => ({
      id: d.id,
      ipv4: d.ipv4,
      ipv6: d.ipv6 || 'N/A',
      status: d.ipv6 ? 'Ready' : 'No IPv6'
    }))
  };
  
  return report;
}
```

## 命令行调用

创建一个命令行工具 `cli.mjs`：

```javascript
#!/usr/bin/env node
import deviceMonitor from './index.mjs';

const action = process.argv[2];
const deviceId = process.argv[3];

switch (action) {
  case 'check':
    const result = await deviceMonitor.checkDevices();
    console.log(JSON.stringify(result, null, 2));
    break;
    
  case 'get-ipv6':
    if (!deviceId) {
      console.error('请提供设备 ID');
      process.exit(1);
    }
    const ipv6 = await deviceMonitor.getDeviceIPv6(deviceId);
    console.log(ipv6 || 'No IPv6');
    break;
    
  case 'list':
    const devices = await deviceMonitor.getAllDevices();
    console.log(JSON.stringify(devices, null, 2));
    break;
    
  case 'status':
    const status = await deviceMonitor.getStatus();
    console.log(JSON.stringify(status, null, 2));
    break;
    
  default:
    console.log('Usage: node cli.mjs <action> [deviceId]');
    console.log('Actions: check, get-ipv6, list, status');
}
```

使用方法：

```bash
# 检查所有设备
node skills/device-monitor/cli.mjs check

# 获取设备 10 的 IPv6
node skills/device-monitor/cli.mjs get-ipv6 10

# 列出所有设备
node skills/device-monitor/cli.mjs list

# 查看状态
node skills/device-monitor/cli.mjs status
```

## HTTP API 调用

通过 Central Hub 的 API 网关调用：

```bash
# 检查所有设备
curl -X POST http://localhost:51000/api/skills/device-monitor/checkDevices

# 获取设备 IPv6
curl -X POST http://localhost:51000/api/skills/device-monitor/getDeviceIPv6 \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "10"}'

# 获取所有设备
curl -X POST http://localhost:51000/api/skills/device-monitor/getAllDevices
```

## 错误处理

所有函数都会返回标准格式的结果或抛出错误：

```javascript
try {
  const result = await deviceMonitor.checkDevices();
  if (result.success) {
    console.log('检查成功:', result);
  } else {
    console.error('检查失败:', result.message);
  }
} catch (error) {
  console.error('发生错误:', error.message);
}
```

## 注意事项

1. **路由器密码**：必须设置 `ROUTER_PASSWORD` 环境变量，否则 SSH 功能不可用
2. **网络连接**：确保运行环境可以通过 SSH 连接到路由器
3. **权限要求**：路由器用户需要有执行 `ip neigh` 和 `ip -6 neigh` 命令的权限
4. **性能考虑**：`checkDevices()` 会通过 SSH 查询路由器，建议不要频繁调用
5. **状态持久化**：设备信息会保存在 `central-hub/data/hub-state.json` 中

## 测试

运行测试：

```bash
npm test -- test/device-monitor.test.mjs
```

## 版本历史

- **1.0.0** (2026-05-01) - 初始版本
  - 支持设备 IPv6 查询
  - 支持设备信息获取
  - 支持端口映射表生成
