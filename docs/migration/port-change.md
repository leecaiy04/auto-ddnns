# 端口修改指南

本指南针对当前精简后的 Auto-DNNS 架构，重点覆盖：

- Central Hub
- Lucky
- SunPanel

Cloudflare 通过远程 API 工作，不涉及本地监听端口。

## 当前默认端口

| 服务 | 默认值 | 说明 |
|---|---|---|
| Central Hub | `51000` | `central-hub/config/hub.json` 中默认端口 |
| Lucky HTTPS | `55000` | 外部代理入口 |
| Lucky API | `16601` | 由 `LUCKY_API_BASE` 决定 |
| SunPanel API | `20001` | 通常体现在 `SUNPANEL_API_BASE` |

## 修改前先确认

如果你既运行 Web 服务又使用 CLI，请同时检查：

- `central-hub/config/hub.json`
- `config/hub.json`
- `.env`

其中：

- Web 服务默认读取 `central-hub/config/hub.json`
- CLI 默认读取 `config/hub.json`
- `.env` 会覆盖 JSON 配置

## 场景 1：修改 Central Hub 端口

### 修改 `.env`

```env
HUB_PORT=52000
```

### 检查 JSON 配置

如果未通过 `.env` 覆盖，确认：

- `central-hub/config/hub.json`
- `config/hub.json`

中的 `server.port` 与目标端口一致。

### 验证

```bash
curl http://localhost:52000/api/health
curl http://localhost:52000/api/dashboard/status
```

## 场景 2：修改 Lucky HTTPS 入口端口

Lucky 对外入口默认是 `50000`。如果修改成其他端口：

1. 更新 `.env` 中的：

```env
LUCKY_HTTPS_PORT=55000
```

2. 如果你的 Lucky 地址直接写在 JSON 配置中，也同步检查：

- `config/hub.json`
- `central-hub/config/hub.json`

3. 如果你依赖服务连通性检测，建议同步检查服务默认代理端口配置。当前代码会在服务连通性检查中读取 Lucky 外部端口，见 `central-hub/routes/services.mjs:299`。

### 验证

```bash
curl http://localhost:51000/api/proxies/sync
curl http://localhost:51000/api/services/connectivity
```

## 场景 3：修改 Lucky API 端口

Lucky API 端口体现在 `LUCKY_API_BASE` 中，例如：

```env
LUCKY_API_BASE=http://192.168.9.200:17001
```

如果使用备节点，也一并更新：

```env
LUCKY_BACKUP_API_BASE=http://192.168.9.2:17001
```

### 验证

```bash
curl http://localhost:51000/api/proxies/sync
curl http://localhost:51000/api/dashboard/status
```

## 场景 4：修改 SunPanel API 端口

SunPanel 端口同样体现在 API Base 中：

```env
SUNPANEL_API_BASE=http://192.168.9.200:21001/openapi/v1
SUNPANEL_BACKUP_API_BASE=http://192.168.9.2:21001/openapi/v1
```

### 验证

```bash
curl -X POST http://localhost:51000/api/sync/sunpanel
curl http://localhost:51000/api/dashboard/status
```

## 应用变更

本地运行：

```bash
npm start
```

Docker Compose：

```bash
docker compose up -d --build
```

## 修改后检查清单

- [ ] Hub 健康检查返回正常
- [ ] Lucky 同步可以执行
- [ ] SunPanel 同步可以执行
- [ ] 服务连通性结果中的代理地址符合预期
- [ ] 防火墙已放行新端口
- [ ] 旧端口引用已从反代、书签或外部探针中移除

## 防火墙示例

```bash
sudo ufw allow 52000/tcp  # Hub
sudo ufw allow 51000/tcp  # Lucky HTTPS
sudo ufw allow 21001/tcp  # SunPanel
```

## 不再适用的旧内容

以下项目不再是当前端口规划的一部分：

- `NPM_HTTPS_PORT`
- `NPM_API_BASE`
- NPM 专用端口映射
