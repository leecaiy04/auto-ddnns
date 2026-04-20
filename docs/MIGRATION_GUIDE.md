# Auto-DNNS 迁移指南

本指南面向当前的精简版架构：

- Central Hub
- 设备监控 / DDNS
- Lucky
- SunPanel
- Cloudflare

旧版文档中的 Nginx Proxy Manager（NPM）迁移内容已不再适用。

## 迁移前检查

建议先备份以下内容：

- `.env`
- `config/hub.json`
- `central-hub/config/hub.json`
- `config/services-registry.json`
- `central-hub/data/hub-state.json`

如果你启用了状态备份，也一并保留 `central-hub/data/backups/`。

## 快速导航

- [IP 地址变更](migration/ip-address-change.md)
- [端口变更](migration/port-change.md)
- [Docker Compose 参考部署](migration/docker-compose.md)

## 通用迁移流程

### 1. 记录当前运行状态

```bash
curl http://your-hub:51000/api/health
curl http://your-hub:51000/api/status
curl http://your-hub:51000/api/services/list
curl http://your-hub:51000/api/cloudflare/status
```

### 2. 备份配置与状态

至少保留：

```text
.env
config/hub.json
central-hub/config/hub.json
config/services-registry.json
central-hub/data/hub-state.json
```

### 3. 按目标环境修改配置

迁移时最常改动的是：

- `ROUTER_HOST` / SSH 凭据
- `ALIYUN_*` DDNS 变量
- `LUCKY_API_BASE` / `LUCKY_BACKUP_API_BASE`
- `SUNPANEL_API_BASE` / `SUNPANEL_BACKUP_API_BASE`
- `CF_API_TOKEN` / `CF_ZONE_ID` / `CF_DOMAIN`
- `HUB_PORT` / `HUB_HOST`

如果你同时使用 Web 服务和 CLI，请确认下面两份文件与 `.env` 保持一致：

- `central-hub/config/hub.json`
- `config/hub.json`

### 4. 启动并执行一次完整同步

```bash
npm start
```

或：

```bash
node cli.mjs sync-all
```

### 5. 验证关键功能

```bash
# Hub 健康
curl http://your-hub:51000/api/health

# DDNS
curl -X POST http://your-hub:51000/api/ddns/refresh

# Lucky
curl -X POST http://your-hub:51000/api/proxies/sync

# SunPanel
curl -X POST http://your-hub:51000/api/sunpanel/sync

# Cloudflare
curl -X POST http://your-hub:51000/api/cloudflare/sync

# 服务连通性
curl http://your-hub:51000/api/services/connectivity
```

## 常见迁移场景

### 场景 1：IP 地址变更

适用于：

- Lucky / SunPanel 主机 IP 变化
- 路由器 IP 变化
- 备用节点地址变化

参考：[`migration/ip-address-change.md`](migration/ip-address-change.md)

### 场景 2：端口变更

适用于：

- Hub 对外端口变化
- Lucky HTTPS 入口端口变化
- SunPanel API 端口变化

参考：[`migration/port-change.md`](migration/port-change.md)

### 场景 3：Docker Compose 部署

适用于：

- 希望将 Central Hub 以容器方式运行
- Lucky / SunPanel 已经在外部环境运行，Hub 只负责调度

参考：[`migration/docker-compose.md`](migration/docker-compose.md)

## 验证清单

迁移完成后，至少确认以下项目：

- [ ] `/api/health` 返回 `status: ok`
- [ ] `/api/status` 中模块状态符合预期
- [ ] `/api/devices/list` 能返回设备数据
- [ ] `/api/ddns/history` 可读取历史
- [ ] `/api/services/list` 能返回服务清单
- [ ] `/api/proxies/sync` 可以成功触发 Lucky 同步
- [ ] `/api/sunpanel/sync` 可以成功触发 SunPanel 同步
- [ ] `/api/cloudflare/status` 与 `/api/cloudflare/sync` 行为正常

## 故障排查

### Hub 启动失败

优先检查：

- `.env` 是否存在
- `HUB_PORT` 是否被占用
- `central-hub/config/hub.json` 是否为有效 JSON
- 必需模块的 API 地址和 token 是否正确

### CLI 与 Web 行为不一致

优先检查两份配置是否一致：

- `config/hub.json`
- `central-hub/config/hub.json`

CLI 默认读取前者，Web 服务默认读取后者。

### Cloudflare 在 CLI 可用但 Web 不可用

当前仓库中，`config/hub.json` 包含 Cloudflare 配置，而 `central-hub/config/hub.json` 可能仍未同步包含对应模块。迁移时请一并检查这两份配置。

## 相关文件

- `README.md`
- `cli.mjs`
- `central-hub/server.mjs`
- `config/hub.json`
- `central-hub/config/hub.json`
