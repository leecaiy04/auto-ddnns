# 中枢服务架构设计

## 🎯 概述

构建一个统一的中枢服务，自动协调整个网络基础设施：
- 路由器 IP 监控
- DDNS 自动更新
- Lucky 反向代理同步
- SunPanel 图标卡片管理
- 局域网 API 服务

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Central Hub Service                      │
│                     (中枢服务 - :51000)                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Router      │  │  DDNS        │  │  Lucky       │      │
│  │  Monitor     │  │  Controller  │  │  Sync        │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                   │                   │             │
│         └───────────────────┼───────────────────┘             │
│                             │                                 │
│                    ┌────────▼────────┐                       │
│                    │  State Manager  │                       │
│                    │  (JSON Store)   │                       │
│                    └────────┬────────┘                       │
│                             │                                 │
│  ┌──────────────────────────┼──────────────────────────┐    │
│  │                          │                          │    │
│  │  ┌───────────────────┐   │   ┌───────────────────┐  │    │
│  │  │   HTTP Server     │   │   │   Scheduler       │  │    │
│  │  │   (Express API)   │   │   │   (node-cron)     │  │    │
│  │  └───────────────────┘   │   └───────────────────┘  │    │
│  │                          │                          │    │
│  └──────────────────────────┴──────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Router     │    │   Lucky      │    │  SunPanel    │
│  (192.168.3.1)│    │  (:16601)    │    │  (:20001)    │
└──────────────┘    └──────────────┘    └──────────────┘
```

## 📦 模块设计

### 1. Router Monitor (路由器监控)
```javascript
{
  name: 'router-monitor',
  description: '从路由器获取公网IP',
  interval: '*/5 * * * *',  // 每5分钟
  endpoints: {
    ipv4: '获取IPv4地址',
    ipv6: '获取IPv6前缀',
    gateway: '网关信息'
  }
}
```

### 2. DDNS Controller (DDNS控制器)
```javascript
{
  name: 'ddns-controller',
  description: '触发DDNS更新',
  triggers: {
    ipChanged: 'IP变更时触发',
    manual: '手动触发',
    scheduled: '定时触发'
  },
  domains: [
    'leecaiy.xyz',
    '*.leecaiy.xyz'
  ]
}
```

### 3. Lucky Sync (Lucky同步)
```javascript
{
  name: 'lucky-sync',
  description: '同步反向代理配置',
  interval: '*/10 * * * *',  // 每10分钟
  actions: {
    fetchProxies: '获取代理列表',
    parseConfig: '解析配置',
    updateState: '更新状态'
  }
}
```

### 4. SunPanel Manager (SunPanel管理)
```javascript
{
  name: 'sunpanel-manager',
  description: '管理SunPanel卡片',
  triggers: {
    proxyAdded: '代理添加时',
    proxyModified: '代理修改时',
    manualSync: '手动同步'
  }
}
```

### 5. State Manager (状态管理)
```javascript
{
  name: 'state-manager',
  description: '持久化状态',
  storage: {
    type: 'json',
    path: 'data/central-hub-state.json',
    backup: true,
    history: 10  // 保留10个历史版本
  }
}
```

## 🔌 RESTful API 设计

### 状态查询
```http
GET /api/status
响应: {
  "status": "healthy",
  "uptime": 3600,
  "lastUpdate": "2026-03-23T16:00:00Z",
  "modules": {
    "router": "ok",
    "ddns": "ok",
    "lucky": "ok",
    "sunpanel": "ok"
  }
}
```

### IP 信息
```http
GET /api/ip
响应: {
  "ipv4": "240e:391:cd0:3d70::xxx",
  "ipv6": "240e:391:cd0:3d70::xxx",
  "gateway": "192.168.3.1",
  "lastCheck": "2026-03-23T16:00:00Z",
  "changed": false
}
```

### DDNS 控制
```http
# 获取 DDNS 状态
GET /api/ddns

# 触发 DDNS 更新
POST /api/ddns/refresh
Body: { "force": true }

# 获取更新历史
GET /api/ddns/history
```

### 代理管理
```http
# 获取所有代理
GET /api/proxies

# 获取单个代理
GET /api/proxies/:id

# 同步到 SunPanel
POST /api/proxies/sync
```

### SunPanel 管理
```http
# 获取 SunPanel 状态
GET /api/sunpanel

# 触发同步
POST /api/sunpanel/sync

# 获取卡片列表
GET /api/sunpanel/cards
```

### 配置管理
```http
# 获取配置
GET /api/config

# 更新配置（热重载）
PUT /api/config
Body: { ... }

# 重载配置
POST /api/config/reload
```

### 健康检查
```http
GET /api/health
响应: {
  "status": "ok",
  "timestamp": "2026-03-23T16:00:00Z"
}
```

## 📊 状态数据结构

```json
{
  "version": "1.0.0",
  "lastUpdate": "2026-03-23T16:00:00Z",
  "uptime": 3600,
  "router": {
    "ipv4": "240e:391:cd0:3d70::xxx",
    "ipv6": "240e:391:cd0:3d70::xxx",
    "gateway": "192.168.3.1",
    "lastCheck": "2026-03-23T16:00:00Z",
    "history": []
  },
  "ddns": {
    "lastUpdate": "2026-03-23T16:00:00Z",
    "domains": [
      {
        "domain": "leecaiy.xyz",
        "record": "@",
        "lastUpdate": "2026-03-23T16:00:00Z",
        "status": "success"
      }
    ],
    "history": []
  },
  "lucky": {
    "lastSync": "2026-03-23T16:00:00Z",
    "proxyCount": 12,
    "proxies": [],
    "history": []
  },
  "sunpanel": {
    "lastSync": "2026-03-23T16:00:00Z",
    "cardCount": 10,
    "groups": [],
    "history": []
  }
}
```

## ⚙️ 配置文件

```json
{
  "server": {
    "port": 51000,
    "host": "0.0.0.0",
    "cors": {
      "enabled": true,
      "origin": "*"
    }
  },
  "router": {
    "gateway": "192.168.3.1",
    "checkInterval": 300,
    "timeout": 10000
  },
  "ddns": {
    "enabled": true,
    "checkInterval": 300,
    "scriptPath": "/home/leecaiy/ddns_work/update_all_ddns.sh",
    "domains": ["leecaiy.xyz", "*.leecaiy.xyz"]
  },
  "lucky": {
    "enabled": true,
    "apiBase": "http://192.168.3.200:16601",
    "openToken": "your-token",
    "syncInterval": 600
  },
  "sunpanel": {
    "enabled": true,
    "apiBase": "http://192.168.3.200:20001/openapi/v1",
    "apiToken": "your-token",
    "syncOnProxyChange": true
  },
  "state": {
    "path": "data/central-hub-state.json",
    "backupPath": "data/backups/",
    "keepHistory": 10
  },
  "logging": {
    "level": "info",
    "file": "logs/central-hub.log",
    "maxSize": "10M",
    "maxFiles": 5
  }
}
```

## 🚀 部署方案

### systemd 服务
```ini
[Unit]
Description=Central Hub Service
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /vol1/1000/code/auto-ddnns/central-hub/server.mjs
WorkingDirectory=/vol1/1000/code/auto-ddnns/central-hub
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
```

### Docker (可选)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 51000
CMD ["node", "server.mjs"]
```

## 🔐 安全考虑

1. **局域网访问**: 仅绑定到内网 IP
2. **API 认证**: 可选的 Bearer Token
3. **HTTPS**: 使用自签名证书
4. **CORS**: 限制跨域访问
5. **速率限制**: 防止 API 滥用
6. **日志审计**: 记录所有操作

## 📈 监控指标

- 服务运行时间
- IP 变更次数
- DDNS 更新成功率
- Lucky 同步状态
- SunPanel 同步状态
- API 请求统计
- 错误率

## 🔄 故障恢复

1. **自动重启**: systemd 自动重启
2. **状态恢复**: 从 JSON 恢复状态
3. **备份恢复**: 历史版本回滚
4. **健康检查**: 定期健康探测
5. **告警通知**: 关键错误通知
