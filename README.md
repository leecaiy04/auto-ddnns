# 🚀 局域网对外部署自动化系统

> 统一的网络基础设施管理平台 - 自动化DDNS、反向代理、IPv6监控和服务管理

## 📖 系统概述

本系统通过 **Central Hub 中枢服务** 统一管理局域网对外部署的所有功能，实现端到端的自动化流程。

### 核心功能

- **📡 设备监控** - 自动SSH连接路由器获取设备IPv6地址
- **🌍 DDNS自动化** - 公网IPv4和局域网IPv6自动更新DNS记录
- **📋 服务清单管理** - 配置化的服务管理，支持快速添加/删除/修改
- **🎲 Lucky反向代理** - 统一50000端口HTTPS入口，自动创建反向代理
- **📋 Nginx Proxy Manager** - 50001端口同步备份
- **🌞 SunPanel集成** - 自动生成展示卡片和分组

### 自动化流程

```
服务配置清单 → Lucky代理(50000) → NPM备份(50001) → SunPanel卡片
                  ↓
            设备IPv6监控 → DDNS更新
```

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Central Hub (51000)                       │
│                  中枢服务 - 统一调度                          │
├─────────────────────────────────────────────────────────────┤
│  设备监控  │  服务清单  │  Lucky管理  │  NPM管理  │  DDNS  │
└─────────────────────────────────────────────────────────────┘
         │            │            │          │       │
         ▼            ▼            ▼          ▼       ▼
┌──────────────┐ ┌─────────┐ ┌──────────┐ ┌──────┐ ┌──────────┐
│ 路由器       │ │配置文件 │ │ Lucky    │ │ NPM  │ │阿里云DNS │
│ 192.168.3.1  │ │JSON     │ │ 50000    │ │50001 │ │ API      │
└──────────────┘ └─────────┘ └──────────┘ └──────┘ └──────────┘
```

## 📁 目录结构

```
auto-dnns/
├── central-hub/              # 中枢服务
│   ├── server.mjs            # 主服务器入口
│   ├── modules/              # 核心模块
│   │   ├── coordinator.mjs   # 总协调器
│   │   ├── device-monitor.mjs    # 设备监控
│   │   ├── service-registry.mjs  # 服务清单管理
│   │   ├── lucky-manager.mjs     # Lucky管理
│   │   ├── npm-manager.mjs        # NPM管理
│   │   └── ...
│   ├── routes/               # API路由
│   └── public/               # 监控界面
│
├── lib/                     # 共享库
│   ├── api-clients/         # API客户端
│   │   ├── lucky-api.mjs
│   │   ├── sunpanel-api.mjs
│   │   └── npm-api.mjs
│   ├── ssh-client.mjs       # SSH客户端
│   └── utils/               # 工具函数
│
├── config/                  # 配置文件
│   ├── hub.json             # 中枢服务配置
│   ├── devices.json         # 设备清单
│   └── services-registry.json # 服务清单
│
├── scripts/                 # 脚本
│   ├── aliddns_sync.sh      # DDNS脚本
│   └── init-setup.mjs       # 初始化脚本
│
└── .env                     # 环境变量配置
```

## 🔌 端口分配

| 端口 | 服务 | 说明 |
|------|------|------|
| **51000** | Central Hub | 监控界面和API服务 ⭐ |
| **50000** | Lucky | HTTPS反向代理主入口 |
| **50001** | Nginx Proxy Manager | HTTPS反向代理备份 |
| **20001** | SunPanel | 服务展示面板 |
| **16601** | Lucky | 管理界面 |

## 🚀 快速开始

### 1. 环境要求

- Node.js 18+
- Linux/Unix 系统（支持 SSH）
- 路由器SSH访问权限
- Lucky 已部署并运行
- Nginx Proxy Manager（可选）
- SunPanel（可选）

### 2. 安装配置

```bash
# 克隆项目（如果还没有）
cd /home/leecaiy/workspace/auto-dnns

# 复制环境变量模板
cp .env.template .env

# 编辑环境变量
vim .env
```

**必需的环境变量：**

```bash
# 路由器SSH配置
ROUTER_HOST=192.168.3.1
ROUTER_USERNAME=root
ROUTER_PASSWORD=your-router-password

# Lucky配置
LUCKY_OPEN_TOKEN=your-lucky-open-token
LUCKY_API_BASE=http://192.168.3.200:16601

# NPM配置（可选）
NPM_API_BASE=http://192.168.3.200:50001
NPM_API_EMAIL=admin@example.com
NPM_API_PASSWORD=changeme
# 如果你已经有静态 Token，也可以改用下面这个配置
# NPM_API_TOKEN=your-npm-api-token

# SunPanel配置
SUNPANEL_API_TOKEN=g1i4ov4xiq2rk7bho6rftwlfnvvjtb09
SUNPANEL_API_BASE=http://192.168.3.200:20001/openapi/v1

# 中枢服务配置
HUB_PORT=51000
HUB_HOST=0.0.0.0
```

### 3. 安装依赖

```bash
npm install
```

### 4. 配置服务清单

编辑 `config/services-registry.json` 添加需要对外发布的服务：

```json
{
  "services": [
    {
      "id": "nas200-web",
      "name": "飞牛OS Web界面",
      "device": "200",
      "internalPort": 443,
      "enableProxy": true,
      "proxyDomain": "nas200.leecaiy.xyz",
      "proxyType": "reverseproxy",
      "enableTLS": true,
      "description": "飞牛OS的Web管理界面"
    }
  ]
}
```

### 5. 启动服务

```bash
# 开发模式（带自动重载）
npm run dev

# 生产模式
npm start

# 运行本地单元测试
npm test
```

### 6. 访问监控界面

打开浏览器访问：
- **监控界面**: http://localhost:51000/
- **API健康检查**: http://localhost:51000/api/health

## 🎮 使用指南

### Web监控界面

访问 `http://localhost:51000/` 可以：

- 📊 查看所有模块状态概览
- 📡 查看设备IPv6地址
- 🌐 查看反向代理数量
- 🔄 一键刷新状态
- ⚡ 完整同步（设备监控 → Lucky → NPM → SunPanel）
- 📱 单独执行各个同步任务

### API接口

#### 监控概览
```bash
curl http://localhost:51000/api/dashboard/overview
```

#### 设备管理
```bash
# 获取所有设备
curl http://localhost:51000/api/devices/list

# 刷新设备IPv6
curl -X POST http://localhost:51000/api/devices/refresh

# 获取端口映射表
curl http://localhost:51000/api/devices/port-mapping-table
```

#### 服务管理
```bash
# 获取所有服务
curl http://localhost:51000/api/services/list

# 添加服务
curl -X POST http://localhost:51000/api/services/add \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-service",
    "name": "我的服务",
    "device": "10",
    "internalPort": 8080,
    "enableProxy": true,
    "proxyDomain": "my.leecaiy.xyz"
  }'

# 更新服务
curl -X PUT http://localhost:51000/api/services/my-service \
  -H "Content-Type: application/json" \
  -d '{"enableProxy": false}'

# 删除服务
curl -X DELETE http://localhost:51000/api/services/my-service
```

#### 同步控制
```bash
# 完整同步
curl -X POST http://localhost:51000/api/sync/full

# Lucky同步
curl -X POST http://localhost:51000/api/proxies/sync

# NPM同步
curl -X POST http://localhost:51000/api/npm/sync

# SunPanel同步
curl -X POST http://localhost:51000/api/sunpanel/sync
```

### 配置文件说明

#### `config/hub.json` - 中枢服务配置

```json
{
  "server": {
    "port": 51000,
    "host": "0.0.0.0"
  },
  "modules": {
    "deviceMonitor": {
      "enabled": true,
      "devices": ["2", "10", "200", "201", "254"]
    },
    "ddns": {
      "enabled": true,
      "scriptPath": "./scripts/aliddns_sync.sh"
    },
    "lucky": {
      "enabled": true,
      "httpsPort": 50000,
      "autoSync": true
    },
    "npm": {
      "enabled": true,
      "httpsPort": 50001,
      "syncFromLucky": true
    },
    "sunpanel": {
      "enabled": true,
      "autoSync": true
    }
  }
}
```

#### `config/devices.json` - 设备清单

定义局域网内的设备信息：

```json
{
  "devices": [
    {
      "id": "200",
      "name": "飞牛OS",
      "ipv4": "192.168.3.200",
      "type": "nas",
      "enableDDNS": true
    }
  ]
}
```

#### `config/services-registry.json` - 服务清单

定义需要反向代理的服务：

```json
{
  "services": [
    {
      "id": "unique-id",
      "name": "服务名称",
      "device": "200",
      "internalPort": 443,
      "enableProxy": true,
      "proxyDomain": "service.leecaiy.xyz",
      "proxyType": "reverseproxy",
      "enableTLS": true,
      "description": "服务描述"
    }
  ]
}
```

## ⚙️ 定时任务

系统会自动执行以下定时任务：

- **每10分钟** - 设备监控（检查IPv6地址）
- **每10分钟** - DDNS更新
- **每15分钟** - Lucky反向代理同步
- **每15分钟** - NPM同步备份
- **每15分钟** - SunPanel卡片同步

可以在 `config/hub.json` 中修改定时任务的执行间隔。

## 🔧 高级功能

### 手动执行DDNS

```bash
cd scripts
bash aliddns_sync.sh all    # 完整流程
bash aliddns_sync.sh scan   # 仅扫描
bash aliddns_sync.sh ddns   # 仅DDNS更新
```

### SSH测试

```bash
node lib/ssh-client.mjs test              # 测试连接
node lib/ssh-client.mjs ipv6              # 查看IPv6邻居表
node lib/ssh-client.mjs map               # 查看设备映射表
node lib/ssh-client.mjs exec "ip -6 neigh"  # 执行命令
```

### Lucky管理

```bash
node lib/api-clients/lucky-port-manager.mjs  # 查看所有端口
```

### NPM管理

```bash
node lib/api-clients/npm-api.mjs test       # 测试连接
node lib/api-clients/npm-api.mjs list       # 查看所有代理
```

### SunPanel管理

```bash
node lib/api-clients/sunpanel-api.mjs test   # 测试连接
node lib/api-clients/sunpanel-api.mjs groups # 查看所有分组
```

## 📊 设备域名映射

根据IPv4地址最后一位自动生成域名：

| 设备 | IPv4 | IPv6域名 | 说明 |
|------|------|----------|------|
| 路由器 | 192.168.3.2 | 2.v6.leecaiy.xyz | DDNS |
| Debian | 192.168.3.10 | 10.v6.leecaiy.xyz | DDNS |
| 飞牛OS | 192.168.3.200 | 200.v6.leecaiy.xyz | DDNS |
| 黑群晖 | 192.168.3.201 | 201.v6.leecaiy.xyz | DDNS |
| 内部设备 | 192.168.3.254 | 254.v6.leecaiy.xyz | DDNS |

## 🐛 故障排查

### 服务无法启动

```bash
# 检查端口占用
sudo lsof -i :51000

# 查看日志
tail -f logs/hub.log
```

### 设备监控失败

- 检查 `ROUTER_PASSWORD` 是否正确
- 确认路由器SSH可访问：`ssh root@192.168.3.1`
- 查看SSH客户端日志

### Lucky同步失败

- 检查 `LUCKY_OPEN_TOKEN` 是否正确
- 确认Lucky服务运行正常：`curl http://192.168.3.200:16601`
- 检查50000端口是否被占用

### NPM同步失败

- 检查 `NPM_API_EMAIL` / `NPM_API_PASSWORD` 或 `NPM_API_TOKEN` 是否正确
- 确认NPM服务运行正常：`curl http://192.168.3.200:50001`
- 检查50001端口是否被占用

### DDNS更新失败

- 检查阿里云API密钥配置
- 手动执行测试：`cd scripts && bash aliddns_sync.sh all`

## 📝 维护建议

### 日常维护

1. **定期检查日志** - `tail -f logs/hub.log`
2. **监控服务状态** - 访问 http://localhost:51000/
3. **备份配置文件** - 定期备份 `config/` 和 `.env`

### 更新服务

添加新服务只需编辑 `config/services-registry.json`，系统会自动同步。

### 备份与恢复

```bash
# 备份状态文件
cp data/hub-state.json data/backups/hub-state-$(date +%Y%m%d).json

# 查看历史备份
ls -lh data/backups/
```

## 🔐 安全建议

1. **保护敏感信息** - `.env` 文件包含密码和Token，不要提交到Git
2. **设置文件权限** - `chmod 600 .env`
3. **限制访问** - 监控界面建议仅在局域网访问
4. **定期更新Token** - 定期更换API Token
5. **监控日志** - 关注异常访问和错误

## 📚 相关文档

- [CLAUDE.md](./CLAUDE.md) - AI助手开发文档
- [docs/](./docs/) - 详细文档和截图

## 🆕 版本信息

- **当前版本**: 2.0
- **最后更新**: 2026-03-29
- **架构**: 统一中枢服务架构

## 📞 获取帮助

遇到问题？

1. 查看日志：`tail -f logs/hub.log`
2. 检查配置：确保 `.env` 文件配置正确
3. 访问监控界面：http://localhost:51000/
4. 查看相关文档

---

**Happy Automation! 🚀**
