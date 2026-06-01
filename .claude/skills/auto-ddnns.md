---
description: 管理和操作 Auto-DDNNS 系统：设备监控、DDNS 更新、Lucky 反向代理、SunPanel 卡片、Cloudflare DNS 同步、服务清单管理等
---

# auto-ddnns

管理 Auto-DDNNS 局域网对外发布自动化工具集。

## 功能

- 查看系统状态和概览
- 管理服务清单（添加、更新、删除服务）
- 同步 Lucky 反向代理配置
- 同步 SunPanel 仪表盘卡片
- 同步 Cloudflare DNS 记录
- 刷新 DDNS 记录
- 设备发现和端口扫描
- 查看变更日志

## 使用场景

当用户需要：
- 查看 Auto-DDNNS 系统状态
- 添加或管理对外服务
- 同步配置到 Lucky、SunPanel 或 Cloudflare
- 查看设备列表和 IPv6 地址
- 排查 DDNS 或代理问题
- 查看系统变更历史

## 工作流程

1. **检查系统状态**
   - 调用健康检查 API
   - 获取系统概览信息
   - 显示关键指标

2. **管理服务**
   - 列出所有服务
   - 添加新服务（自动触发同步）
   - 更新服务配置
   - 删除服务

3. **手动同步**
   - Lucky 反向代理同步
   - SunPanel 卡片同步
   - Cloudflare DNS 同步
   - 完整同步（全部）

4. **设备管理**
   - 查看设备列表
   - 刷新设备状态
   - 扫描设备端口

5. **故障排查**
   - 查看 DDNS 历史
   - 查看变更日志
   - 检查服务状态

## API 端点

### 基础信息
- `GET /api/health` - 健康检查
- `GET /api/dashboard/overview` - 系统概览
- `GET /api/dashboard/status` - 状态摘要

### 服务管理
- `GET /api/services/list` - 服务列表
- `GET /api/services/status` - 服务状态
- `POST /api/services/add` - 添加服务
- `PUT /api/services/{id}` - 更新服务
- `DELETE /api/services/{id}` - 删除服务
- `POST /api/services/validate` - 校验配置

### 同步控制
- `POST /api/sync/full` - 完整同步
- `GET /api/proxies/sync` - Lucky 同步
- `POST /api/sync/sunpanel` - SunPanel 同步
- `POST /api/cloudflare/sync` - Cloudflare 同步
- `POST /api/ddns/refresh` - DDNS 刷新

### 设备管理
- `GET /api/devices/list` - 设备列表
- `POST /api/devices/refresh` - 刷新设备
- `GET /api/devices/key-machines` - 关键机器
- `POST /api/devices/{device}/scan` - 扫描端口

### 其他
- `GET /api/ddns/history` - DDNS 历史
- `GET /api/changelog` - 变更日志
- `GET /api/proxies` - Lucky 代理状态
- `GET /api/cloudflare/status` - Cloudflare 状态

## 配置

Hub 默认地址：`http://localhost:51000`

如果 Hub 在其他地址，设置环境变量：
```bash
export HUB_URL=http://192.168.9.200:51000
```

## 示例

### 查看系统状态
```bash
curl http://localhost:51000/api/health
curl http://localhost:51000/api/dashboard/overview
```

### 添加新服务
```bash
curl -X POST http://localhost:51000/api/services/add \
  -H "Content-Type: application/json" \
  -d '{
    "id": "demo",
    "name": "Demo Service",
    "device": "200",
    "internalPort": 8080,
    "enableProxy": true,
    "proxyDomain": "demo.example.com"
  }'
```

### 同步配置
```bash
# Lucky 同步
curl http://localhost:51000/api/proxies/sync

# SunPanel 同步
curl -X POST http://localhost:51000/api/sync/sunpanel

# 完整同步
curl -X POST http://localhost:51000/api/sync/full
```

### 查看设备
```bash
curl http://localhost:51000/api/devices/list
curl http://localhost:51000/api/devices/key-machines
```

## 注意事项

1. **自动同步**：添加、更新、删除服务时会自动触发 Lucky、SunPanel 和 Cloudflare 同步
2. **定时任务**：系统每 10-15 分钟自动执行一次完整同步
3. **网络要求**：需要能访问路由器 SSH、Lucky API、SunPanel API 和 Cloudflare API
4. **权限要求**：当前 API 无认证保护，仅适用于内网环境

## 故障排查

### 服务无法访问
1. 检查 Hub 是否运行：`curl http://localhost:51000/api/health`
2. 检查端口占用：`lsof -i :51000`
3. 查看日志：`pm2 logs auto-ddnns`

### 同步失败
1. 检查目标服务连接性
2. 验证 Token 配置
3. 查看变更日志：`curl http://localhost:51000/api/changelog`

### 设备发现失败
1. 检查路由器 SSH 连接
2. 验证路由器凭据
3. 手动刷新：`curl -X POST http://localhost:51000/api/devices/refresh`
