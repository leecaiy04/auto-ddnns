# Auto-DNNS

一个围绕 **Central Hub** 的局域网对外发布自动化工具集，当前保留并聚焦以下能力：

- 设备发现与 IPv6 监控
- 阿里云 DDNS 更新
- 服务清单管理
- Lucky 反向代理同步
- SunPanel 卡片同步
- Cloudflare DNS 同步
- Web 面板与 CLI 操作

当前仓库已按精简方向移除 **Nginx Proxy Manager（NPM）** 相关功能与文档入口。

## 当前架构

```text
路由器 (SSH)
    |
DeviceMonitor ──── 扫描 IPv6 邻居表
    |
ServiceRegistry ── 服务清单 (JSON 文件)
       |              |
  LuckyManager    SunPanelManager    CloudflareManager
  (反向代理+DDNS)   (仪表盘卡片)      (DNS A/AAAA 记录)
       \              |              /
    Coordinator ── node-cron 定时调度
          |
    Express API + Dashboard (:51000)
```

## 目录概览

```text
auto-dnns/
├── central-hub/                 # Express 服务、路由、前端仪表盘与本地 HTTP CLI
│   ├── server.mjs               # Central Hub 入口
│   ├── coordinator.mjs          # 模块编排与定时调度
│   ├── routes/                  # REST API
│   ├── public/                  # 前端面板
│   └── hub-cli.mjs              # 基于 HTTP API 的命令行客户端
├── modules/                     # 独立功能模块
│   ├── device-monitor/
│   ├── lucky-manager/
│   ├── sunpanel-manager/
│   ├── cloudflare-manager/
│   └── service-registry/
├── shared/                      # 配置/状态等共享基础设施
├── config/                      # 服务清单等共享 JSON 数据
├── scripts/                     # 辅助脚本
├── test/                        # Node.js 测试
└── .env.template                # 环境变量模板
```

## 配置来源

当前服务运行时配置优先级为：

```text
.env > central-hub/config/hub.json > 默认值
```

`npm start` 与 `npm run dev` 都会按上述优先级启动 Central Hub。

## 快速开始

### 1. 准备环境

要求：

- Node.js 18+
- 可访问路由器的 SSH 凭据
- Lucky 已部署
- SunPanel 已部署（如需卡片同步）
- Cloudflare Token（如需 Cloudflare 同步）

### 2. 创建 `.env`

```bash
cp .env.template .env
```

至少检查并填写这些变量：

```env
ROUTER_HOST=192.168.9.1
ROUTER_USERNAME=router_query_ro
ROUTER_PASSWORD=your-r...word
ROUTER_SSL_VERIFY=0

ALIYUN_AK=your-aliyun-access-key-id
ALIYUN_SK=your-aliyun-access-key-secret
ALIYUN_DOMAIN=example.com

LUCKY_API_BASE=http://192.168.9.200:16601
LUCKY_OPEN_TOKEN=your-lucky-open-token
LUCKY_HTTPS_PORT=55000

SUNPANEL_API_BASE=http://192.168.9.200:20001/openapi/v1
SUNPANEL_API_TOKEN=your-sunpanel-api-token

CF_API_TOKEN=your-cloudflare-api-token
CF_ZONE_ID=your-zone-id
CF_DOMAIN=example.com

HUB_PORT=51000
HUB_HOST=0.0.0.0
```

### 3. 安装依赖

```bash
npm install
```

### 4. 启动 Central Hub

```bash
npm start
```

开发模式：

```bash
npm run dev
```

测试：

```bash
npm test
```

## 常用 CLI

当前仓库提供一个基于 HTTP API 的本地客户端：`central-hub/hub-cli.mjs`。

```bash
# 默认访问 http://localhost:51000
node central-hub/hub-cli.mjs health
node central-hub/hub-cli.mjs overview
node central-hub/hub-cli.mjs status
node central-hub/hub-cli.mjs ip
node central-hub/hub-cli.mjs ddns
node central-hub/hub-cli.mjs ddns:refresh
node central-hub/hub-cli.mjs proxies
node central-hub/hub-cli.mjs sunpanel
node central-hub/hub-cli.mjs sunpanel:sync
```

如果 Hub 不在本机，先覆盖 `HUB_URL`：

```bash
HUB_URL=http://192.168.9.200:51000 node central-hub/hub-cli.mjs status
```

## 默认端口

> 以下是当前代码中的默认值；若 `.env` 或配置文件覆盖，请以实际部署值为准。

| 服务 | 默认端口 / 地址 | 说明 |
|---|---|---|
| Central Hub | `51000` | Web 面板与 API |
| Lucky HTTPS | `55000` | 外部代理入口 |
| Lucky API | `16601` | 常用于 API 管理地址 |
| SunPanel | `20001` | OpenAPI 常见入口端口 |
| Cloudflare | 无本地端口 | 通过远程 API 同步 |

## 运行后的常用入口

如果 `HUB_PORT` 未覆盖，默认访问：

- Web 面板：`http://localhost:51000/`
- 健康检查：`http://localhost:51000/api/health`
- 状态摘要：`http://localhost:51000/api/dashboard/status`
- 概览信息：`http://localhost:51000/api/dashboard/overview`

## 核心 API

### 同步控制

```bash
# 完整同步
curl -X POST http://localhost:51000/api/sync/full

# Lucky 同步
curl http://localhost:51000/api/proxies/sync

# SunPanel 同步
curl -X POST http://localhost:51000/api/sync/sunpanel

# Cloudflare 同步
curl -X POST http://localhost:51000/api/cloudflare/sync

# DDNS 调和
curl -X POST http://localhost:51000/api/ddns/refresh
```

### 设备相关

```bash
# 设备列表
curl http://localhost:51000/api/devices/list

# 刷新设备状态
curl -X POST http://localhost:51000/api/devices/refresh

# 关键机器
curl http://localhost:51000/api/devices/key-machines

# 扫描候选端口
curl http://localhost:51000/api/devices/scan-ports

# 扫描指定设备开放端口
curl -X POST http://localhost:51000/api/devices/200/scan
```

### 服务清单

```bash
# 所有服务
curl http://localhost:51000/api/services/list

# 服务状态
curl http://localhost:51000/api/services/status

# 校验服务配置
curl -X POST http://localhost:51000/api/services/validate \
  -H "Content-Type: application/json" \
  -d '{"id":"demo","name":"Demo","device":"200","internalPort":8080}'

# 添加服务
curl -X POST http://localhost:51000/api/services/add \
  -H "Content-Type: application/json" \
  -d '{
    "id":"demo",
    "name":"Demo",
    "device":"200",
    "internalPort":8080,
    "enableProxy":true,
    "proxyDomain":"demo.example.com"
  }'

# 更新服务
curl -X PUT http://localhost:51000/api/services/demo \
  -H "Content-Type: application/json" \
  -d '{"enableProxy":false}'

# 删除服务
curl -X DELETE http://localhost:51000/api/services/demo
```

### 其他常用服务 API

```bash
# Lucky 当前代理状态
curl http://localhost:51000/api/proxies

# 直接通过资源路由触发 Lucky 同步（GET）
curl http://localhost:51000/api/proxies/sync

# Cloudflare 状态
curl http://localhost:51000/api/cloudflare/status

# Cloudflare Token 校验
curl http://localhost:51000/api/cloudflare/verify-token

# DDNS 历史
curl http://localhost:51000/api/ddns/history
```

## 服务清单变更后的自动同步

当前 `services` 路由在以下操作后会自动触发同步：

- 添加服务
- 更新服务
- 删除服务
- 快速添加服务

自动触发 Lucky、SunPanel，以及在启用 Cloudflare 时触发 Cloudflare 同步。实现见 `central-hub/routes/services.mjs:9`、`central-hub/routes/services.mjs:82`、`central-hub/routes/services.mjs:141`、`central-hub/routes/services.mjs:173`、`central-hub/routes/services.mjs:216`。

## 迁移与运维文档

- `docs/MIGRATION_GUIDE.md`
- `docs/migration/ip-address-change.md`
- `docs/migration/port-change.md`
- `docs/migration/docker-compose.md`

## 文档

- [CLAUDE.md](CLAUDE.md) - Claude Code 项目指引
- [SECURITY.md](SECURITY.md) - 安全指南和最佳实践
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - 系统架构文档
- [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md) - 改进建议和待办事项
- [docs/PROJECT_REVIEW.md](docs/PROJECT_REVIEW.md) - 项目检查报告
- [docs/MIGRATION_GUIDE.md](docs/MIGRATION_GUIDE.md) - 迁移指南

## 项目质量

- ✅ **测试覆盖**：110 个测试用例，100% 通过
- ✅ **代码质量**：模块化设计，职责清晰
- ✅ **文档完善**：包含架构、安全、改进建议等文档
- ⚠️ **安全性**：建议添加 API 认证，详见 [SECURITY.md](SECURITY.md)

## 当前已不再包含的内容

以下内容已不属于当前精简架构：

- Nginx Proxy Manager 同步
- `/api/npm/*` 相关接口
- `sync-npm` CLI 命令
- NPM 专用配置项与文档章节

如果你正在从旧版本迁移，请直接参考 `docs/MIGRATION_GUIDE.md` 中的简化版说明。
