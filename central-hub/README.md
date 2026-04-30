# Central Hub - 中枢服务

统一的网络基础设施管理服务，通过 Coordinator 编排各功能模块。

## 功能

- **设备监控** — 通过 SSH 扫描路由器 IPv6 邻居表，发现局域网设备
- **DDNS 管理** — 通过 Lucky 内置 DDNS 自动调和 DNS 任务
- **反向代理** — 同步服务清单到 Lucky 反向代理规则
- **仪表盘卡片** — 同步 Lucky 代理到 SunPanel 仪表盘
- **DNS 记录** — 同步服务到 Cloudflare DNS（A/AAAA 记录）
- **服务清单** — 白名单模式管理需要代理的内部服务
- **Web 仪表盘** — 单页前端，端口扫描、服务管理、连接性检测

## API 接口

### 同步控制

```bash
POST /api/sync/full          # 完整同步（设备 → DDNS → Lucky → SunPanel → CF）
POST /api/sync/sunpanel      # 单独触发 SunPanel 同步
```

### 仪表盘

```bash
GET  /api/dashboard/overview  # 概览信息
GET  /api/dashboard/status    # 全部模块状态
```

### 设备

```bash
GET  /api/devices/list        # 已发现设备列表
POST /api/devices/refresh     # 刷新设备发现
GET  /api/devices/scan-ports  # 扫描所有设备端口
POST /api/devices/:id/scan    # 深度扫描单个设备
GET  /api/devices/key-machines  # 关键设备列表
```

### 服务

```bash
GET    /api/services/list          # 服务清单
POST   /api/services/add           # 添加服务
PUT    /api/services/:id           # 更新服务
DELETE /api/services/:id           # 删除服务
POST   /api/services/quick-add     # 从端口扫描快速添加
GET    /api/services/connectivity  # IPv4/IPv6 连通性检测
GET    /api/services/proxy-defaults  # 全局代理默认配置
PUT    /api/services/proxy-defaults  # 更新全局代理默认配置
```

### DDNS

```bash
GET  /api/ddns              # DDNS 任务状态
POST /api/ddns/reconcile    # 调和 DDNS 任务
POST /api/ddns/refresh      # 兼容旧入口，等同 reconcile
POST /api/ddns/sync/:key    # 触发单个任务同步
GET  /api/ddns/logs         # DDNS 日志
```

### 代理

```bash
GET /api/proxies            # Lucky 代理状态
GET /api/proxies/sync       # 触发 Lucky 同步
```

### Cloudflare

```bash
GET    /api/cloudflare           # DNS 记录列表 + 状态
POST   /api/cloudflare/sync      # 触发 DNS 同步
DELETE /api/cloudflare/record    # 删除指定记录
GET    /api/cloudflare/verify-token  # 验证 API Token
```

### 其他

```bash
GET    /api/config           # 脱敏后的配置
GET    /api/bookmarks/list   # 外部书签
POST   /api/bookmarks/add    # 添加书签
GET    /api/changelog        # 变更日志
GET    /api/health           # 健康检查
```

## 配置

环境变量（`.env`）优先级高于 `central-hub/config/hub.json`。参见 `.env.template`。

### 主要配置项

| 配置 | 说明 | 默认值 |
|------|------|--------|
| `HUB_PORT` | 服务端口 | 51000 |
| `LUCKY_API_BASE` | Lucky API 地址 | - |
| `LUCKY_OPEN_TOKEN` | Lucky OpenToken | - |
| `SUNPANEL_API_BASE` | SunPanel API 地址 | - |
| `SUNPANEL_API_TOKEN` | SunPanel API Token | - |
| `CF_API_TOKEN` | Cloudflare API Token | - |
| `ROUTER_HOST` | 路由器地址 | 192.168.9.1 |

### 定时调度

| 任务 | 默认间隔 | 说明 |
|------|----------|------|
| deviceMonitor | 每 10 分钟 | 扫描局域网设备 |
| ddns | 每小时 | 调和 DDNS 任务 |
| luckySync | 每 15 分钟 | 同步反向代理规则 |
| sunpanelSync | 每 15 分钟 | 同步 SunPanel 卡片 |
| cloudflareSync | 每 15 分钟 | 同步 Cloudflare DNS |
| saveState | 每分钟 | 持久化状态 |

## 部署

### PM2（推荐）

```bash
# 通过 ecosystem.config.cjs
pm2 start ecosystem.config.cjs
pm2 logs auto-ddnns
```

### systemd

```bash
sudo ln -sf /vol1/1000/code/auto-ddnns/central-hub/central-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now central-hub
```

### Docker

参见 `docs/migration/docker-compose.md`。

## 状态数据

保存在 `data/hub-state.json`，包含各模块的同步状态和历史记录。自动备份到 `data/backups/`。
