# 🎯 Central Hub - 中枢服务

统一的网络基础设施管理服务，自动协调 DDNS、Lucky、SunPanel 等服务。

## 📋 功能特性

### 核心功能
- ✅ **路由器监控**: 自动检测公网 IP 变更
- ✅ **DDNS 控制**: 触发 DDNS 自动更新
- ✅ **Lucky 同步**: 获取反向代理配置
- ✅ **SunPanel 管理**: 自动管理图标卡片
- ✅ **状态持久化**: JSON 格式保存状态
- ✅ **局域网 API**: RESTful API 接口
- ✅ **定时任务**: 自动化执行各项任务

### API 接口

```bash
# 健康检查
GET /api/health

# 整体状态
GET /api/status

# IP 信息
GET /api/ip

# DDNS 控制
GET  /api/ddns          # 获取 DDNS 状态
POST /api/ddns/refresh  # 触发 DDNS 更新

# 代理管理
GET /api/proxies        # 获取代理列表

# SunPanel 管理
GET  /api/sunpanel      # 获取 SunPanel 状态
POST /api/sunpanel/sync # 触发同步

# 配置管理
GET  /api/config        # 获取配置
PUT  /api/config        # 更新配置
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd central-hub
npm install
```

### 2. 配置文件

```bash
# 复制配置模板
cp config/central-hub.json.template config/central-hub.json

# 编辑配置
vim config/central-hub.json
```

### 3. 启动服务

```bash
# 开发模式（带自动重载）
npm run dev

# 生产模式
npm start
```

### 4. 测试 API

```bash
# 健康检查
curl http://localhost:3000/api/health

# 获取状态
curl http://localhost:3000/api/status

# 获取 IP
curl http://localhost:3000/api/ip

# 触发 DDNS 更新
curl -X POST http://localhost:3000/api/ddns/refresh
```

## ⚙️ 配置说明

```json
{
  "server": {
    "port": 3000,          // 服务端口
    "host": "0.0.0.0",     // 监听地址
    "cors": {
      "enabled": true,
      "origin": "*"        // CORS 允许的来源
    }
  },
  "router": {
    "gateway": "192.168.3.1",
    "checkInterval": 300,  // IP 检查间隔（秒）
    "timeout": 10000       // 超时时间
  },
  "ddns": {
    "enabled": true,
    "scriptPath": "/home/leecaiy/ddns_work/update_all_ddns.sh",
    "domains": ["leecaiy.xyz"]
  },
  "lucky": {
    "enabled": true,
    "apiBase": "http://192.168.3.200:16601",
    "openToken": "your-token"
  },
  "sunpanel": {
    "enabled": true,
    "apiBase": "http://192.168.3.200:20001/openapi/v1",
    "apiToken": "your-token"
  }
}
```

## 🤖 自动化部署

### systemd 服务

```bash
# 安装服务
sudo ln -s /home/leecaiy/workspace/auto-dnns/central-hub/central-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable central-hub
sudo systemctl start central-hub

# 查看状态
sudo systemctl status central-hub

# 查看日志
sudo journalctl -u central-hub -f
```

### Docker (可选)

```bash
# 构建镜像
docker build -t central-hub .

# 运行容器
docker run -d \
  --name central-hub \
  --network host \
  -v /home/leecaiy/workspace/auto-dnns/config:/app/config \
  -v /home/leecaiy/workspace/auto-dnns/data:/app/data \
  central-hub
```

## 📊 状态数据

状态保存在 `data/central-hub-state.json`:

```json
{
  "version": "1.0.0",
  "lastUpdate": "2026-03-23T16:00:00Z",
  "router": {
    "ipv4": "240e:xxx",
    "ipv6": "240e:xxx",
    "lastCheck": "2026-03-23T16:00:00Z"
  },
  "ddns": {
    "lastUpdate": "2026-03-23T16:00:00Z",
    "history": []
  },
  "lucky": {
    "lastSync": "2026-03-23T16:00:00Z",
    "proxies": []
  },
  "sunpanel": {
    "lastSync": "2026-03-23T16:00:00Z",
    "cards": []
  }
}
```

## 🔧 使用示例

### 局域网内其他服务查询 IP

```bash
# 简单查询
curl http://192.168.3.x:3000/api/ip

# 获取 JSON 并解析
curl -s http://192.168.3.x:3000/api/ip | jq '.ipv4'
```

### Shell 脚本中使用

```bash
#!/bin/bash
HUB_API="http://192.168.3.x:3000/api"

# 获取当前公网 IP
IPV4=$(curl -s "$HUB_API/ip" | jq -r '.ipv4')
echo "当前 IPv4: $IPV4"

# 触发 DDNS 更新
curl -X POST "$HUB_API/ddns/refresh"

# 获取 Lucky 代理列表
curl -s "$HUB_API/proxies" | jq '.'
```

### Python 中使用

```python
import requests

hub_api = "http://192.168.3.x:3000/api"

# 获取状态
status = requests.get(f"{hub_api}/status").json()

# 获取 IP
ip_info = requests.get(f"{hub_api}/ip").json()
print(f"IPv4: {ip_info['ipv4']}")

# 触发 DDNS
response = requests.post(f"{hub_api}/ddns/refresh")
```

## 📁 项目结构

```
central-hub/
├── server.mjs              # 主服务器
├── package.json            # 依赖配置
├── config/
│   └── central-hub.json    # 配置文件
├── modules/
│   ├── state-manager.mjs   # 状态管理
│   ├── router-monitor.mjs  # 路由器监控
│   ├── ddns-controller.mjs # DDNS 控制
│   ├── lucky-sync.mjs      # Lucky 同步
│   └── sunpanel-manager.mjs # SunPanel 管理
├── routes/
│   ├── status.mjs          # 状态路由
│   ├── ip.mjs              # IP 路由
│   ├── ddns.mjs            # DDNS 路由
│   ├── proxy.mjs           # 代理路由
│   ├── sunpanel.mjs        # SunPanel 路由
│   └── config.mjs          # 配置路由
├── data/
│   ├── central-hub-state.json  # 状态文件
│   └── backups/                # 备份目录
└── logs/
    └── central-hub.log          # 日志文件
```

## 🔐 安全建议

1. **防火墙**: 仅允许局域网访问
2. **认证**: 生产环境添加 API Token
3. **HTTPS**: 使用反向代理启用 HTTPS
4. **日志**: 定期检查日志文件

## 📝 开发计划

- [ ] WebSocket 实时推送
- [ ] Web 管理界面
- [ ] 告警通知（邮件/Telegram）
- [ ] 更多监控指标
- [ ] 配置热重载
- [ ] API 认证

## 📄 许可证

MIT
