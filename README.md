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
设备监控 / 路由器 SSH
          ↓
     DDNSController
          ↓
    ServiceRegistry
      ↙    ↓    ↘
 Lucky   SunPanel  Cloudflare
          ↓
     Central Hub API + Dashboard
```

## 目录概览

```text
auto-dnns/
├── central-hub/                 # Web 服务、API、状态与调度
│   ├── server.mjs               # Central Hub 入口
│   ├── modules/                 # 设备、DDNS、Lucky、Cloudflare 等模块
│   ├── routes/                  # REST API
│   └── public/                  # 前端面板
├── config/                      # CLI 默认读取的配置
├── central-hub/config/          # Web 服务默认读取的配置
├── scripts/                     # DDNS 等脚本
├── test/                        # Node.js 测试
├── cli.mjs                      # 本地 CLI 入口
└── .env.template                # 环境变量模板
```

## 配置来源

运行时配置优先级为：

```text
.env > JSON 配置 > 默认值
```

当前仓库存在两份 Hub JSON 配置：

- `central-hub/config/hub.json`：`npm start` / `npm run dev` 启动 Web 服务时默认读取
- `config/hub.json`：`node cli.mjs ...` 执行 CLI 任务时默认读取

如果你使用了 Cloudflare 或其他新增模块，建议保持这两份配置一致。

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
ROUTER_HOST=192.168.3.1
ROUTER_USERNAME=root
ROUTER_PASSWORD=your-router-password

ALIYUN_AK=your-aliyun-access-key-id
ALIYUN_SK=your-aliyun-access-key-secret
ALIYUN_DOMAIN=example.com

LUCKY_API_BASE=http://192.168.3.200:16601
LUCKY_OPEN_TOKEN=your-lucky-open-token
LUCKY_HTTPS_PORT=50000

SUNPANEL_API_BASE=http://192.168.3.200:20001/openapi/v1
SUNPANEL_API_TOKEN=your-sunpanel-api-token

CF_API_TOKEN=your-cloudflare-api-token
CF_ZONE_ID=your-zone-id
CF_DOMAIN=example.com

HUB_PORT=51100
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

`cli.mjs` 当前支持这些任务：

```bash
node cli.mjs sync-all
node cli.mjs sync-ddns
node cli.mjs sync-lucky
node cli.mjs sync-cloudflare
node cli.mjs sync-sunpanel
node cli.mjs import-lucky
node cli.mjs monitor
```

对应实现见 `cli.mjs:42`、`cli.mjs:165`。

## GitHub Actions 部署

- 已提供手动部署工作流：`.github/workflows/deploy-fnos.yml`
- 当前只支持部署 `main` 分支
- 当前不会自动拉取或自动发布，需要你在 GitHub Actions 页面手动点击触发
- 因为飞牛主机是局域网地址 `192.168.3.200`，需要在飞牛 OS 上安装 `self-hosted runner`
- 详细说明见 `docs/github-actions-fnos.md`

## 默认端口

> 以下是当前代码中的默认值；若 `.env` 或配置文件覆盖，请以实际部署值为准。

| 服务 | 默认端口 / 地址 | 说明 |
|---|---|---|
| Central Hub | `51100` | Web 面板与 API，见 `central-hub/config/hub.json:3` |
| Lucky HTTPS | `50000` | 外部代理入口，见 `config/hub.json:52` |
| Lucky API | `16601` | 常用于 API 管理地址 |
| SunPanel | `20001` | OpenAPI 常见入口端口 |
| Cloudflare | 无本地端口 | 通过远程 API 同步 |

## 运行后的常用入口

如果 `HUB_PORT` 未覆盖，默认访问：

- Web 面板：`http://localhost:51100/`
- 健康检查：`http://localhost:51100/api/health`
- 状态摘要：`http://localhost:51100/api/status`

对应代码见 `central-hub/server.mjs:275`、`central-hub/server.mjs:347`。

## 核心 API

### 同步控制

```bash
# 完整同步
curl -X POST http://localhost:51100/api/sync/full

# Lucky 同步
curl -X POST http://localhost:51100/api/proxies/sync

# SunPanel 同步
curl -X POST http://localhost:51100/api/sunpanel/sync

# Cloudflare 同步
curl -X POST http://localhost:51100/api/cloudflare/sync

# DDNS 刷新
curl -X POST http://localhost:51100/api/ddns/refresh
```

对应代码见 `central-hub/server.mjs:297`、`central-hub/server.mjs:317`、`central-hub/server.mjs:327`、`central-hub/server.mjs:337` 与 `central-hub/routes/ddns.mjs:20`。

### 设备相关

```bash
# 设备列表
curl http://localhost:51100/api/devices/list

# 刷新设备状态
curl -X POST http://localhost:51100/api/devices/refresh

# 关键机器
curl http://localhost:51100/api/devices/key-machines

# 扫描候选端口
curl http://localhost:51100/api/devices/scan-ports

# 扫描指定设备开放端口
curl -X POST http://localhost:51100/api/devices/200/scan
```

对应代码见 `central-hub/routes/devices.mjs:14`、`central-hub/routes/devices.mjs:45`、`central-hub/routes/devices.mjs:122`、`central-hub/routes/devices.mjs:197`、`central-hub/routes/devices.mjs:244`。

### 服务清单

```bash
# 所有服务
curl http://localhost:51100/api/services/list

# 服务状态
curl http://localhost:51100/api/services/status

# 校验服务配置
curl -X POST http://localhost:51100/api/services/validate \
  -H "Content-Type: application/json" \
  -d '{"id":"demo","name":"Demo","device":"200","internalPort":8080}'

# 添加服务
curl -X POST http://localhost:51100/api/services/add \
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
curl -X PUT http://localhost:51100/api/services/demo \
  -H "Content-Type: application/json" \
  -d '{"enableProxy":false}'

# 删除服务
curl -X DELETE http://localhost:51100/api/services/demo
```

对应代码见 `central-hub/routes/services.mjs:39`、`central-hub/routes/services.mjs:55`、`central-hub/routes/services.mjs:71`、`central-hub/routes/services.mjs:129`、`central-hub/routes/services.mjs:150`、`central-hub/routes/services.mjs:166`。

### 其他常用服务 API

```bash
# Lucky 当前代理状态
curl http://localhost:51100/api/proxies

# 直接通过资源路由触发 Lucky 同步（GET）
curl http://localhost:51100/api/proxies/sync

# Cloudflare 状态
curl http://localhost:51100/api/cloudflare/status

# Cloudflare Token 校验
curl http://localhost:51100/api/cloudflare/verify-token

# DDNS 历史
curl http://localhost:51100/api/ddns/history
```

对应代码见 `central-hub/routes/proxy.mjs:10`、`central-hub/routes/proxy.mjs:23`、`central-hub/routes/cloudflare.mjs:11`、`central-hub/routes/cloudflare.mjs:39`、`central-hub/routes/cloudflare.mjs:53`、`central-hub/routes/ddns.mjs:30`。

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

## 当前已不再包含的内容

以下内容已不属于当前精简架构：

- Nginx Proxy Manager 同步
- `/api/npm/*` 相关接口
- `sync-npm` CLI 命令
- NPM 专用配置项与文档章节

如果你正在从旧版本迁移，请直接参考 `docs/MIGRATION_GUIDE.md` 中的简化版说明。
