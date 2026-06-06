# Auto-DDNNS 架构文档

**版本**: v2.0.0  
**更新日期**: 2026-06-06

---

## 系统架构概览

Auto-DDNNS 是一个模块化的局域网网络基础设施自动化系统，采用分层架构设计。

```
┌─────────────────────────────────────────────────────────┐
│              Central Hub (Express Server)               │
│                  端口: 51000                             │
├─────────────────────────────────────────────────────────┤
│                    API Routes                            │
│  /api/dashboard  /api/devices  /api/services           │
│  /api/ddns       /api/proxies  /api/cloudflare         │
│  /api/sync       /api/config   /api/changelog          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   Coordinator                            │
│          (Cron-based Task Scheduler)                     │
│   • 设备监控 (*/10 * * * *)                             │
│   • DDNS 调和 (0 * * * *)                               │
│   • Lucky 同步 (*/15 * * * *)                           │
│   • SunPanel 同步 (*/15 * * * *)                        │
│   • Cloudflare 同步 (*/15 * * * *)                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  Modules Layer                           │
├──────────────┬──────────────┬──────────────┬────────────┤
│DeviceMonitor │LuckyManager  │SunPanelMgr   │CloudflareMgr│
│              │              │              │            │
│• SSH Router  │• ReverseProxy│• Cards CRUD  │• DNS A/AAAA│
│• IPv6 Map    │• DDNS Tasks  │• Groups CRUD │• Records   │
│• Neighbors   │• SSL Certs   │• OpenAPI     │• Zone Mgmt │
│              │• Port Forward│• Internal API│            │
│              │• WOL         │              │            │
└──────────────┴──────────────┴──────────────┴────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                 Shared Services                          │
│  • StateManager      - JSON 状态持久化                   │
│  • ChangelogManager  - 变更审计日志                      │
│  • ConfigLoader      - 配置加载和合并                    │
│  • EnvLoader         - 环境变量解析                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                External Services                         │
│  • Router (SSH)      - 设备发现、IPv6 获取              │
│  • Lucky (HTTP)      - 反向代理、DDNS、SSL              │
│  • SunPanel (HTTP)   - 仪表盘卡片管理                   │
│  • Cloudflare (API)  - 外部 DNS 管理                    │
└─────────────────────────────────────────────────────────┘
```

---

## 核心模块详解

### 1. DeviceMonitor (设备监控模块)

**位置**: `modules/device-monitor/`

**职责**:
- 通过 SSH 连接路由器
- 获取设备 IPv6 地址映射
- 扫描 ARP/NDP 邻居表
- 提供设备在线状态

**关键 API**:
```javascript
class DeviceMonitor {
  async checkDevices()           // 扫描所有设备
  getIPv6Map()                   // 获取设备 -> IPv6 映射
  async scanDevicePorts(mac)     // 扫描设备端口
}
```

**依赖**:
- `ssh2` - SSH 客户端库
- `StateManager` - 持久化设备状态

**配置**:
```json
{
  "deviceMonitor": {
    "enabled": true,
    "router": {
      "host": "192.168.9.1",
      "username": "root",
      "password": "xxx"
    }
  }
}
```

---

### 2. LuckyManager (Lucky 管理模块)

**位置**: `modules/lucky-manager/`

**职责**:
- 反向代理规则管理
- DDNS 任务调和
- SSL 证书管理
- 端口转发管理
- WOL 网络唤醒

**子模块**:
- `lucky-api.mjs` - 基础 HTTP 客户端
- `lucky-reverseproxy.mjs` - 反向代理 API
- `lucky-ddns.mjs` - DDNS 管理
- `lucky-ssl.mjs` - SSL 证书管理
- `lucky-port-manager.mjs` - 端口管理
- `lucky-portforward.mjs` - 端口转发
- `lucky-wol.mjs` - WOL 唤醒
- `lucky-system.mjs` - 系统信息

**关键 API**:
```javascript
class LuckyManager {
  // 反向代理
  async syncServicesToLucky(services, ipv6Map)
  async getLuckyProxies()
  
  // DDNS
  async reconcileDDNSTasks()
  async getDDNSTaskStatus()
  
  // SSL
  async getSSLList()
  async listExpiringSoonCerts(days)
  
  // 端口转发
  async getPortForwardRules()
  
  // WOL
  async wakeDevice(mac)
}
```

**多实例支持**:
```javascript
config.modules.lucky.instances = [
  { apiBase: 'https://lucky.domain.com', openToken: 'xxx' },  // 主节点
  { apiBase: 'https://backup.domain.com', openToken: 'yyy' }  // 备用节点
]
```

---

### 3. SunPanelManager (SunPanel 管理模块)

**位置**: `modules/sunpanel-manager/`

**职责**:
- 同步服务卡片到 SunPanel 仪表盘
- 管理分组和卡片
- 支持 OpenAPI 和内部 API

**关键 API**:
```javascript
class SunPanelManager {
  async syncToSunPanel(services, luckyProxies, luckyLanHost)
  async purgeAllCards({ dryRun })
  async findItemByTitle(title)
  async listAllItems()
}
```

**API 双模式**:
- **OpenAPI**: 使用 `SUNPANEL_API_TOKEN`，稳定但功能受限
- **Internal API**: 使用用户名/密码，功能完整，作为备选

---

### 4. CloudflareManager (Cloudflare DNS 管理模块)

**位置**: `modules/cloudflare-manager/`

**职责**:
- 管理外部 DNS A/AAAA 记录
- 同步服务的 IPv6 地址到 Cloudflare
- 自动创建/更新/删除记录

**关键 API**:
```javascript
class CloudflareManager {
  async syncServicesToCF(services, ipv6Map)
  async listDNSRecords(zoneId)
  async createDNSRecord(zoneId, record)
}
```

---

### 5. ServiceRegistry (服务清单模块)

**位置**: `modules/service-registry/`

**职责**:
- 管理服务清单（CRUD）
- 触发级联同步
- 记录变更日志

**服务定义**:
```javascript
{
  "name": "grafana",
  "displayName": "Grafana 监控",
  "mac": "00:11:22:33:44:55",
  "port": 3000,
  "domain": "grafana.example.com",
  "enabled": true,
  "category": "monitoring",
  "icon": "📊"
}
```

**级联同步流程**:
```
Service Changed
    ↓
ServiceRegistry.updateService()
    ↓
Trigger Coordinator.runFullSync()
    ↓
1. LuckyManager.syncServicesToLucky()
    ↓
2. SunPanelManager.syncToSunPanel()
    ↓
3. CloudflareManager.syncServicesToCF()
```

---

### 6. Coordinator (协调器)

**位置**: `central-hub/coordinator.mjs`

**职责**:
- 调度定时任务
- 编排模块间调用顺序
- 处理同步逻辑

**定时任务**:
| 任务 | 频率 | 说明 |
|------|------|------|
| 设备监控 | */10 * * * * | 每 10 分钟扫描设备 |
| DDNS 调和 | 0 * * * * | 每小时调和 DDNS 任务 |
| Lucky 同步 | */15 * * * * | 每 15 分钟同步反向代理 |
| SunPanel 同步 | */15 * * * * | 每 15 分钟同步卡片 |
| Cloudflare 同步 | */15 * * * * | 每 15 分钟同步 DNS |
| 状态保存 | * * * * * | 每分钟保存状态 |

**同步流程**:
```javascript
async runFullSync() {
  // 1. 设备发现
  await deviceMonitor.checkDevices();
  const ipv6Map = deviceMonitor.getIPv6Map();
  
  // 2. 服务清单
  const services = serviceRegistry.getServices();
  
  // 3. Lucky 反向代理
  await luckyManager.syncServicesToLucky(services, ipv6Map);
  const luckyProxies = await luckyManager.getLuckyProxies();
  
  // 4. SunPanel 卡片
  await sunpanelManager.syncToSunPanel(services, luckyProxies);
  
  // 5. Cloudflare DNS
  await cloudflareManager.syncServicesToCF(services, ipv6Map);
}
```

---

## 共享服务详解

### StateManager (状态管理器)

**位置**: `shared/state-manager.mjs`

**职责**:
- 管理 JSON 状态文件
- 提供状态读写接口
- 自动备份机制

**状态文件**:
- `hub-state.json` - 系统全局状态
- `services-registry.json` - 服务清单
- `changelog.json` - 变更日志

**备份策略**:
- 每次保存前创建备份
- 保留最近 5 个备份
- 备份文件命名: `state-{timestamp}.json`

---

### ChangelogManager (变更日志管理器)

**位置**: `shared/changelog-manager.mjs`

**职责**:
- 记录所有变更操作
- 提供变更历史查询
- 支持审计和回滚

**日志格式**:
```javascript
{
  "timestamp": "2026-06-06T12:00:00.000Z",
  "type": "service",
  "action": "update",
  "target": "grafana",
  "changes": {
    "domain": { "old": "grafana.old.com", "new": "grafana.new.com" }
  },
  "userId": "system"
}
```

---

## 数据流示意

### 服务添加流程

```
1. User → POST /api/services
         ↓
2. ServiceRegistry.addService()
         ↓
3. ChangelogManager.log('service', 'create')
         ↓
4. StateManager.save()
         ↓
5. Coordinator.runFullSync()
         ↓
6. Lucky 创建反向代理规则
         ↓
7. SunPanel 创建仪表盘卡片
         ↓
8. Cloudflare 创建 DNS 记录
         ↓
9. Response → User
```

### 设备监控流程

```
1. Coordinator (每 10 分钟)
         ↓
2. DeviceMonitor.checkDevices()
         ↓
3. SSH → Router
         ↓
4. 执行: ip -6 neigh show
         ↓
5. 解析邻居表
         ↓
6. 更新 IPv6 映射
         ↓
7. StateManager.save()
```

---

## 配置系统

### 配置优先级

```
环境变量 (.env)
    ↓ 覆盖
配置文件 (hub.json)
    ↓ 覆盖
默认值 (代码中)
```

### 配置加载流程

```javascript
// 1. 加载 .env 文件
await loadEnvFileAsync();

// 2. 加载并合并配置
const config = await loadConfigWithEnv('config/hub.json');

// 3. 运行时配置覆盖
applyRuntimeConfigOverrides(config);
```

### 多实例配置示例

```javascript
// Lucky 主备节点
LUCKY_API_BASE=https://lucky.domain.com:55000/666
LUCKY_OPEN_TOKEN=primary_token

LUCKY_BACKUP_API_BASE=https://backup.domain.com:55000/666
LUCKY_BACKUP_OPEN_TOKEN=backup_token

// SunPanel 主备节点
SUNPANEL_API_BASE=https://sunpanel.domain.com/api/v1
SUNPANEL_API_TOKEN=primary_token

SUNPANEL_BACKUP_API_BASE=https://backup-sunpanel.domain.com/api/v1
SUNPANEL_BACKUP_API_TOKEN=backup_token
```

---

## 错误处理策略

### 重试机制

```javascript
// Lucky API 调用
try {
  await luckyAPI.call();
} catch (error) {
  if (error.status === 429) {
    await sleep(5000);
    return retry();
  }
  throw error;
}
```

### 降级策略

```javascript
// SunPanel 内部 API 失败 → 降级到 OpenAPI
try {
  return await internalAPI();
} catch (error) {
  console.warn('内部 API 失败，回退到 OpenAPI');
  return await openAPI();
}
```

---

## 性能优化

### 当前优化
- HTTP Keep-Alive 连接复用
- 状态缓存减少文件 I/O
- 批量操作减少 API 调用

### 计划优化（v2.1）
- 缓存层（Lucky/SunPanel API）
- 增量同步替代全量同步
- 并行模块初始化
- HTTP 连接池

---

## 安全考虑

### 认证方式
- Lucky: OpenToken（推荐）或用户名/密码
- SunPanel: API Token（推荐）或用户名/密码
- Cloudflare: API Token（只读 Zone + 编辑 DNS）
- Router: SSH 密钥或用户名/密码

### 敏感信息处理
- 所有凭证存储在 `.env` 文件
- API 响应自动脱敏
- 日志中不记录敏感信息

---

## 部署架构

### 生产环境

```
PM2 (Process Manager)
  ↓
Node.js (>=18.0.0)
  ↓
Central Hub Server (:51000)
  ↓
FNOS NAS (24/7 运行)
```

### 端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| Central Hub | 51000 | Web 监控界面 + API |
| Lucky | 16601 | 反向代理管理界面 |
| Lucky HTTPS | 55000 | HTTPS 反向代理入口 |
| SunPanel | 20001 | 仪表盘界面 |

---

## 监控与可观测性

### 健康检查
- `GET /api/health` - 基础健康检查
- `GET /api/dashboard/overview` - 详细状态概览

### 日志
- Console 输出（PM2 捕获）
- 日志级别：INFO、WARN、ERROR
- 计划：结构化日志（v2.1）

### 指标
- 运行时长 (uptime)
- 同步任务执行次数
- 错误计数
- 计划：Prometheus 指标导出（v2.1）

---

## 扩展性设计

### 添加新模块

1. 创建模块目录：`modules/new-module/`
2. 实现模块类：`index.mjs`
3. 在 `server.mjs` 中注册
4. 在 `coordinator.mjs` 中添加调度
5. 创建 API 路由

### 添加新外部服务

1. 创建 API 客户端：`new-service-api.mjs`
2. 创建管理器：`NewServiceManager`
3. 配置多实例支持
4. 集成到同步流程

---

## 参考资料

- [CLAUDE.md](../CLAUDE.md) - 项目概览和开发指南
- [REFACTORING_PLAN.md](../REFACTORING_PLAN.md) - v2.1 重构计划
- [API 更新文档](./api-updates/) - 最近的 API 更新
- [脚本分析](./scripts-analysis.md) - 临时脚本整理方案
