# Docker Compose 部署参考

本页提供的是 **Central Hub 容器化参考方案**。当前仓库的精简架构不再包含 Nginx Proxy Manager；Lucky 与 SunPanel 可继续运行在宿主机或其他独立环境中，由 Hub 通过 API 连接。

## 适用场景

适合以下情况：

- 你想把 Central Hub 单独容器化
- Lucky / SunPanel 已经在局域网其他机器运行
- 你只需要 Hub 提供调度、API 和面板

## 目录准备

```bash
mkdir -p ~/auto-dnns-docker
cd ~/auto-dnns-docker
mkdir -p central-hub/config central-hub/data config
```

将以下文件复制到部署目录：

- 项目源码
- `.env`
- `central-hub/config/hub.json`
- `config/hub.json`
- `config/services-registry.json`

## 示例 `docker-compose.yml`

```yaml
services:
  central-hub:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: auto-dnns-hub
    command: npm start
    restart: unless-stopped
    ports:
      - "51100:51100"
    volumes:
      - ./.env:/app/.env:ro
      - ./central-hub/config:/app/central-hub/config
      - ./central-hub/data:/app/central-hub/data
      - ./config:/app/config
    environment:
      NODE_ENV: production
```

## 示例 `Dockerfile`

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 51100

CMD ["npm", "start"]
```

## 关键配置说明

### 1. `.env`

至少保证这些变量正确：

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

### 2. 两份 Hub 配置

如果你会在容器中同时使用 Web 服务和 CLI，请保持以下两份配置一致：

- `central-hub/config/hub.json`
- `config/hub.json`

尤其是：

- `server.port`
- `modules.cloudflare`
- `modules.lucky`
- `modules.sunpanel`
- `modules.ddns`

## 启动

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f central-hub
```

## 验证

```bash
# 健康检查
curl http://localhost:51100/api/health

# 完整同步
curl -X POST http://localhost:51100/api/sync/full

# Lucky 同步
curl -X POST http://localhost:51100/api/proxies/sync

# SunPanel 同步
curl -X POST http://localhost:51100/api/sunpanel/sync

# Cloudflare 状态
curl http://localhost:51100/api/cloudflare/status
```

## 部署建议

- 将 `central-hub/data/` 挂载为持久卷，避免状态丢失
- 将 `.env` 作为只读文件挂载
- 不要把 API token 直接写进镜像
- 若容器内需要访问局域网服务，确保网络与防火墙允许访问 Lucky、SunPanel 和路由器

## 不再适用的旧内容

以下旧版部署内容已不再属于当前架构：

- Nginx Proxy Manager 容器
- `data/npm` 卷
- `NPM_API_*` 环境变量
- `/api/npm/*` 相关探针或同步步骤
