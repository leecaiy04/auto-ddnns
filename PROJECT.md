# Auto-DDNNS 项目文档

> 局域网对外发布自动化工具集 v2.0.0

## 项目简介

Auto-DDNNS 是一个围绕 **Central Hub** 的局域网网络基础设施自动化工具集，统一编排设备监控、DDNS 更新、反向代理管理、仪表盘卡片同步和外部 DNS 管理。

### 核心功能

- 🔍 **设备发现与 IPv6 监控** - 通过路由器 SSH 扫描 IPv6 邻居表
- 🌐 **阿里云 DDNS 更新** - 自动更新域名解析记录
- 📋 **服务清单管理** - 统一管理所有对外服务
- 🔀 **Lucky 反向代理同步** - 自动配置反向代理规则和 SSL 证书
- 📊 **SunPanel 卡片同步** - 自动更新仪表盘卡片
- ☁️ **Cloudflare DNS 同步** - 同步 DNS A/AAAA 记录
- 🖥️ **Web 面板与 CLI 操作** - 提供 Web 界面和命令行工具

## 系统架构

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
    Coordinator ── node-cron 定时调度 (10-15分钟)
          |
    Express API + Dashboard (:51000)
```

### 目录结构

```text
auto-ddnns/
├── central-hub/                 # Express 服务、路由、前端仪表盘
│   ├── server.mjs               # Central Hub 入口
│   ├── coordinator.mjs          # 模块编排与定时调度
│   ├── routes/                  # REST API 路由
│   ├── public/                  # 前端面板
│   └── hub-cli.mjs              # 命令行客户端
├── modules/                     # 独立功能模块
│   ├── device-monitor/          # 设备发现
│   ├── lucky-manager/           # Lucky 反向代理 + DDNS + SSL
│   ├── sunpanel-manager/        # SunPanel 仪表盘卡片
│   ├── cloudflare-manager/      # Cloudflare DNS
│   └── service-registry/        # 服务清单
├── shared/                      # 共享基础设施
│   ├── env-loader.mjs           # 环境变量解析
│   ├── state-manager.mjs        # 状态持久化
│   ├── changelog-manager.mjs    # 变更审计日志
│   └── config-loader.mjs        # 配置加载器
├── config/                      # 配置文件
├── scripts/                     # 辅助脚本
├── test/                        # 测试文件
├── .env.template                # 环境变量模板
└── ecosystem.config.cjs         # PM2 配置
```

### 关键设计

- **模块独立** - 每个功能模块独立，可单独导入使用
- **无数据库** - 所有状态以 JSON 文件存储
- **全量 ESM** - 纯 ES Module，无 CommonJS
- **多实例支持** - Lucky 和 SunPanel 支持主节点 + 备用节点
- **自动同步级联** - 服务清单变更自动触发 Lucky → SunPanel → Cloudflare 同步

## 快速开始

### 环境要求

- Node.js 18+
- 路由器 SSH 访问权限
- Lucky 已部署
- SunPanel 已部署（可选）
- Cloudflare Token（可选）

### 安装步骤

1. **克隆项目**
```bash
cd /vol1/1000/code
git clone <repository-url> auto-ddnns
cd auto-ddnns
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**
```bash
cp .env.template .env
# 编辑 .env 文件，填写必要的配置
```

必填配置项：
```env
# 路由器配置
ROUTER_HOST=192.168.9.1
ROUTER_USERNAME=router_query_ro
ROUTER_PASSWORD=your-password

# 阿里云 DDNS
ALIYUN_AK=your-access-key-id
ALIYUN_SK=your-access-key-secret
ALIYUN_DOMAIN=example.com

# Lucky 配置
LUCKY_API_BASE=http://192.168.9.200:16601
LUCKY_OPEN_TOKEN=your-lucky-token
LUCKY_HTTPS_PORT=55000

# Hub 配置
HUB_PORT=51000
HUB_HOST=0.0.0.0
```

4. **启动服务**
```bash
# 开发模式（带自动重载）
npm run dev

# 生产模式
npm start

# PM2 部署
pm2 start ecosystem.config.cjs
```

5. **访问面板**
```
http://localhost:51000
```

## 常用命令

### NPM 脚本

```bash
npm start            # 启动 Central Hub
npm run dev          # 开发模式（自动重载）
npm test             # 运行所有测试
npm run init         # 首次安装向导
```

### CLI 工具

```bash
# 基础命令
node central-hub/hub-cli.mjs health        # 健康检查
node central-hub/hub-cli.mjs overview      # 系统概览
node central-hub/hub-cli.mjs status        # 状态摘要

# 设备管理
node central-hub/hub-cli.mjs ip            # 查看 IP 信息

# DDNS 管理
node central-hub/hub-cli.mjs ddns          # DDNS 状态
node central-hub/hub-cli.mjs ddns:refresh  # 刷新 DDNS

# 代理管理
node central-hub/hub-cli.mjs proxies       # Lucky 代理列表

# SunPanel 管理
node central-hub/hub-cli.mjs sunpanel      # SunPanel 状态
node central-hub/hub-cli.mjs sunpanel:sync # 同步卡片

# 远程访问
HUB_URL=http://192.168.9.200:51000 node central-hub/hub-cli.mjs status
```

## API 接口

### 同步控制

```bash
# 完整同步
POST /api/sync/full

# Lucky 同步
GET /api/proxies/sync

# SunPanel 同步
POST /api/sync/sunpanel

# Cloudflare 同步
POST /api/cloudflare/sync

# DDNS 刷新
POST /api/ddns/refresh
```

### 设备管理

```bash
# 设备列表
GET /api/devices/list

# 刷新设备状态
POST /api/devices/refresh

# 关键机器
GET /api/devices/key-machines

# 扫描端口
GET /api/devices/scan-ports
POST /api/devices/{device}/scan
```

### 服务清单

```bash
# 所有服务
GET /api/services/list

# 服务状态
GET /api/services/status

# 添加服务
POST /api/services/add
{
  "id": "demo",
  "name": "Demo Service",
  "device": "200",
  "internalPort": 8080,
  "enableProxy": true,
  "proxyDomain": "demo.example.com"
}

# 更新服务
PUT /api/services/{id}

# 删除服务
DELETE /api/services/{id}

# 校验配置
POST /api/services/validate
```

### 仪表盘

```bash
# 系统概览
GET /api/dashboard/overview

# 状态摘要
GET /api/dashboard/status

# 健康检查
GET /api/health
```

## 配置说明

### 配置优先级

```text
.env > central-hub/config/hub.json > 默认值
```

### 主要配置项

#### 路由器配置
```env
ROUTER_HOST=192.168.9.1          # 路由器地址
ROUTER_USERNAME=router_query_ro  # SSH 用户名
ROUTER_PASSWORD=your-password    # SSH 密码
ROUTER_SSL_VERIFY=0              # SSL 验证（0=关闭）
```

#### Lucky 配置
```env
LUCKY_API_BASE=http://192.168.9.200:16601  # Lucky API 地址
LUCKY_OPEN_TOKEN=your-token                # OpenToken
LUCKY_HTTPS_PORT=55000                     # HTTPS 端口
LUCKY_USERNAME=admin                       # Web 登录用户名（可选）
LUCKY_PASSWORD=password                    # Web 登录密码（可选）
```

#### SunPanel 配置
```env
SUNPANEL_API_BASE=http://192.168.9.200:20001/openapi/v1
SUNPANEL_API_TOKEN=your-token
SUNPANEL_USERNAME=admin          # Web 登录用户名（可选）
SUNPANEL_PASSWORD=password       # Web 登录密码（可选）
```

#### Cloudflare 配置
```env
CF_API_TOKEN=your-token          # API Token
CF_ZONE_ID=your-zone-id          # Zone ID
CF_DOMAIN=example.com            # 域名
```

#### Hub 配置
```env
HUB_PORT=51000                   # 服务端口
HUB_HOST=0.0.0.0                 # 监听地址
```

### 多实例配置

支持配置备用节点：
```env
LUCKY_BACKUP_API_BASE=http://192.168.9.201:16601
LUCKY_BACKUP_OPEN_TOKEN=backup-token

SUNPANEL_BACKUP_API_BASE=http://192.168.9.201:20001/openapi/v1
SUNPANEL_BACKUP_API_TOKEN=backup-token
```

## 部署方式

### PM2 部署（推荐）

```bash
# 启动
pm2 start ecosystem.config.cjs

# 查看状态
pm2 status auto-ddnns

# 查看日志
pm2 logs auto-ddnns

# 重启
pm2 restart auto-ddnns

# 停止
pm2 stop auto-ddnns
```

### Systemd 服务

```bash
# 复制服务文件
sudo cp central-hub/central-hub.service /etc/systemd/system/

# 启动服务
sudo systemctl start central-hub
sudo systemctl enable central-hub

# 查看状态
sudo systemctl status central-hub
```

### Docker 部署

```bash
# 构建镜像
docker build -t auto-ddnns .

# 运行容器
docker run -d \
  --name auto-ddnns \
  -p 51000:51000 \
  -v $(pwd)/.env:/app/.env \
  -v $(pwd)/config:/app/config \
  -v $(pwd)/data:/app/data \
  auto-ddnns
```

## 开发指南

### 技术栈

- **运行时**: Node.js 18+ (纯 ESM)
- **Web 框架**: Express.js
- **定时任务**: node-cron
- **SSH 客户端**: ssh2
- **HTTP 客户端**: axios
- **测试**: Node.js 内置 test runner

### 开发流程

1. **启动开发服务器**
```bash
npm run dev
```

2. **运行测试**
```bash
# 所有测试
npm test

# 单个测试文件
node --test test/config-loader.test.mjs
```

3. **代码规范**
- 使用 ES Module (`import/export`)
- 模块独立，职责单一
- 配置通过环境变量或配置文件
- 错误处理完善
- 添加必要的日志

### 添加新模块

1. 在 `modules/` 下创建新目录
2. 实现模块类（导出为默认）
3. 在 `central-hub/server.mjs` 中导入并初始化
4. 在 `central-hub/coordinator.mjs` 中添加调度逻辑
5. 添加对应的路由文件
6. 编写测试用例

### 测试覆盖

当前测试覆盖：
- ✅ 配置加载器
- ✅ 状态管理器
- ✅ 变更日志管理器
- ✅ 设备监控
- ✅ 服务清单
- ✅ Lucky 管理器
- ✅ SunPanel 管理器
- ✅ Cloudflare 管理器

测试统计：110 个测试用例，100% 通过

## 运维管理

### 服务入口

| 服务 | 地址 | 说明 |
|------|------|------|
| Central Hub | http://192.168.9.200:51000 | Web 面板和 API |
| Lucky | http://192.168.9.2:16601 | 反向代理管理 |
| SunPanel | http://192.168.9.2:20001 | 仪表盘 |
| Cloudflare | https://dash.cloudflare.com | DNS 管理 |
| 路由器 | http://192.168.9.1 | 路由器管理 |

### 默认端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Central Hub | 51000 | Web 面板与 API |
| Lucky HTTPS | 55000 | 外部代理入口 |
| Lucky API | 16601 | API 管理地址 |
| SunPanel | 20001 | OpenAPI 入口 |

### 日志管理

```bash
# PM2 日志
pm2 logs auto-ddnns

# 实时日志
pm2 logs auto-ddnns --lines 100

# 错误日志
pm2 logs auto-ddnns --err

# 清空日志
pm2 flush auto-ddnns
```

### 数据备份

重要数据文件：
- `config/services-registry.json` - 服务清单
- `config/hub.json` - Hub 配置
- `central-hub/data/hub-state.json` - 运行状态
- `config/changelog.json` - 变更日志
- `.env` - 环境变量

备份命令：
```bash
# 创建备份
tar -czf backup-$(date +%Y%m%d).tar.gz config/ central-hub/data/ .env

# 恢复备份
tar -xzf backup-20260601.tar.gz
```

### 故障排查

#### 服务无法启动
1. 检查端口占用：`lsof -i :51000`
2. 检查配置文件：`node central-hub/hub-cli.mjs health`
3. 查看日志：`pm2 logs auto-ddnns`

#### 设备发现失败
1. 检查路由器 SSH 连接：`ssh router_query_ro@192.168.9.1`
2. 检查路由器配置：`.env` 中的 `ROUTER_*` 变量
3. 手动刷新设备：`curl -X POST http://localhost:51000/api/devices/refresh`

#### DDNS 更新失败
1. 检查阿里云凭据：`.env` 中的 `ALIYUN_*` 变量
2. 查看 DDNS 历史：`curl http://localhost:51000/api/ddns/history`
3. 手动刷新 DDNS：`curl -X POST http://localhost:51000/api/ddns/refresh`

#### Lucky 同步失败
1. 检查 Lucky 连接：`curl http://192.168.9.200:16601/api/health`
2. 检查 OpenToken：`.env` 中的 `LUCKY_OPEN_TOKEN`
3. 手动同步：`curl http://localhost:51000/api/proxies/sync`

## 安全建议

### 网络安全
- ✅ Hub 端口 (51000) 仅在内网访问
- ✅ 使用防火墙限制访问 IP 段
- ⚠️ 当前 API 无认证保护（仅适用于内网）

### 配置安全
- ✅ 敏感信息通过 `.env` 管理
- ✅ `.env` 已添加到 `.gitignore`
- ✅ 提供 `.env.template` 模板
- ✅ 配置文件权限设置为 600

### 日志安全
- ✅ 日志中敏感信息已脱敏
- ✅ Token 仅显示前缀（如 `sun-token...`）

### 未来改进
- [ ] 添加 API Token 认证
- [ ] 添加 JWT 认证
- [ ] 添加请求频率限制
- [ ] 收紧 CORS 配置

## CI/CD

### GitHub Actions

- `deploy-main-selfhosted.yml` - 推送 main 分支自动部署
- `deploy-fnos.yml` - 手动触发部署到 FNOS NAS
- `test-main.yml` - 运行测试

### 部署流程

1. 推送代码到 main 分支
2. GitHub Actions 自动触发
3. 运行测试
4. 部署到生产环境
5. PM2 重启服务

## 项目质量

- ✅ **测试覆盖**: 110 个测试用例，100% 通过
- ✅ **代码质量**: 模块化设计，职责清晰
- ✅ **文档完善**: 包含架构、安全、改进建议等文档
- ⚠️ **安全性**: 建议添加 API 认证

## 常见问题

### Q: 如何获取 Lucky OpenToken？
A: Lucky 设置页 → 安全设置 → OpenToken → 生成并复制

### Q: 如何添加新服务？
A: 使用 API 或 Web 面板添加，系统会自动同步到 Lucky、SunPanel 和 Cloudflare

### Q: 如何备份配置？
A: 备份 `config/` 目录、`central-hub/data/` 目录和 `.env` 文件

### Q: 如何迁移到新服务器？
A: 复制项目目录、安装依赖、更新 `.env` 配置、启动服务

### Q: 定时任务多久执行一次？
A: 默认 10-15 分钟执行一次完整同步

## 许可证

MIT License

## 维护者

- **作者**: leecaiy
- **版本**: 2.0.0
- **更新**: 2026-06-01
