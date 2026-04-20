# IP 地址变更指南

当网络环境变化时，当前版本需要重点更新的对象是：

- 路由器 SSH 地址
- Lucky API 地址
- SunPanel API 地址
- 可选的备用节点地址
- Central Hub 对外访问地址（如果主机本身变更）

旧版文档中的 Nginx Proxy Manager（NPM）IP 变更步骤已不再适用。

## 需要关注的配置

### `.env`

最常见的变更项：

```env
ROUTER_HOST=192.168.3.1

LUCKY_API_BASE=http://192.168.3.200:16601
LUCKY_BACKUP_API_BASE=http://192.168.3.2:16601

SUNPANEL_API_BASE=http://192.168.3.200:20001/openapi/v1
SUNPANEL_BACKUP_API_BASE=http://192.168.3.2:20001/openapi/v1

HUB_HOST=0.0.0.0
HUB_PORT=51000
```

### JSON 配置

如果没有被 `.env` 覆盖，也应检查：

- `central-hub/config/hub.json`
- `config/hub.json`

重点关注：

- `modules.deviceMonitor.router.host`
- `modules.lucky.apiBase`
- `modules.sunpanel.apiBase`
- `server.host`
- `server.port`

## 标准步骤

### 1. 备份当前配置

```bash
cp .env .env.backup
cp config/hub.json config/hub.json.backup
cp central-hub/config/hub.json central-hub/config/hub.json.backup
```

### 2. 更新 `.env`

例如：

```env
ROUTER_HOST=192.168.10.1
LUCKY_API_BASE=http://192.168.10.200:16601
SUNPANEL_API_BASE=http://192.168.10.200:20001/openapi/v1
```

如果你启用了备节点，也同步更新：

```env
LUCKY_BACKUP_API_BASE=http://192.168.10.2:16601
SUNPANEL_BACKUP_API_BASE=http://192.168.10.2:20001/openapi/v1
```

### 3. 检查两份 Hub 配置

如果某些地址硬编码在 JSON 中，也要同步调整：

- `config/hub.json`
- `central-hub/config/hub.json`

### 4. 重启或重新启动服务

```bash
npm start
```

或：

```bash
node cli.mjs sync-all
```

### 5. 验证

```bash
# Hub 健康
curl http://your-hub:51000/api/health

# 设备与 DDNS
curl http://your-hub:51000/api/devices/list
curl -X POST http://your-hub:51000/api/ddns/refresh

# Lucky 与 SunPanel
curl -X POST http://your-hub:51000/api/proxies/sync
curl -X POST http://your-hub:51000/api/sunpanel/sync

# Cloudflare
curl http://your-hub:51000/api/cloudflare/status
curl -X POST http://your-hub:51000/api/cloudflare/sync

# 服务连通性
curl http://your-hub:51000/api/services/connectivity
```

## 验证清单

- [ ] 路由器 SSH 仍可访问
- [ ] `/api/devices/list` 能返回设备
- [ ] `/api/ddns/refresh` 可以执行
- [ ] `/api/proxies/sync` 可以执行
- [ ] `/api/sunpanel/sync` 可以执行
- [ ] `/api/cloudflare/status` 显示符合预期
- [ ] `/api/services/connectivity` 中的目标地址已更新

## 常见问题

### Lucky 同步失败

优先检查：

- `LUCKY_API_BASE` 是否已改为新地址
- Lucky API 端口是否随 IP 一起变化
- 新主机是否允许 Hub 访问

### SunPanel 同步失败

优先检查：

- `SUNPANEL_API_BASE` 是否更新
- token 是否仍有效
- OpenAPI 路径是否仍为 `/openapi/v1`

### Web 服务正常，但 CLI 行为不一致

这通常意味着：

- `config/hub.json` 与 `central-hub/config/hub.json` 不一致
- `.env` 仅覆盖了其中一种运行方式

## 额外建议

- IP 迁移完成后，执行一次 `sync-all`
- 如果公网域名也发生变化，同时检查 `ALIYUN_DOMAIN` 与 Cloudflare 对应域名配置
- 如果 Lucky 对外 HTTPS 入口也变化，请同时参考 `port-change.md`
