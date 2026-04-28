# 中枢服务架构设计

## 概述

Central Hub 是 Auto-DNNS 的编排入口，负责把设备发现、DDNS、Lucky、SunPanel 和 Cloudflare 统一挂到一个 Express 服务中，并由 Coordinator 调度自动同步流程。

默认入口：`central-hub/server.mjs`

## 当前组件关系

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

## 核心数据流

1. `DeviceMonitor.checkDevices()` 扫描路由器，刷新设备与 IPv6 信息。
2. `DeviceMonitor.getIPv6Map()` 提供设备 IPv6 映射。
3. `LuckyManager.reconcileDDNSTasks()` 调和 Lucky 内置 DDNS 任务。
4. `LuckyManager.syncServicesToLucky(services, ipv6Map)` 同步反向代理规则。
5. `LuckyManager.getLuckyProxies()` 与 `getLanHost()` 提供 Lucky 当前代理与局域网入口。
6. `SunPanelManager.syncToSunPanel(services, luckyProxies, luckyLanHost)` 更新 SunPanel 卡片。
7. `CloudflareManager.syncServicesToCF(services, ipv6Map)` 同步 Cloudflare DNS 记录。

## HTTP 路由

当前服务在 `central-hub/server.mjs` 中挂载以下入口：

- `GET /api/health`
- `GET /api/dashboard/overview`
- `GET /api/dashboard/status`
- `GET /api/devices/list`
- `POST /api/devices/refresh`
- `GET /api/services/list`
- `POST /api/services/add`
- `GET /api/ddns`
- `POST /api/ddns/reconcile`
- `POST /api/ddns/refresh`
- `GET /api/proxies`
- `GET /api/proxies/sync`
- `GET /api/cloudflare`
- `POST /api/cloudflare/sync`
- `POST /api/sync/full`
- `POST /api/sync/sunpanel`
- `GET /api/config`

## 状态视图

### `/api/dashboard/overview`
用于首页概览，返回：

- 调度任务数
- 设备总数与 IPv6 就绪数
- 服务总数
- DDNS 任务数
- Lucky 代理数
- SunPanel 卡片数
- Cloudflare 启用状态

### `/api/dashboard/status`
用于完整状态查看，返回：

- `coordinator.isRunning`
- `coordinator.scheduledTasks`
- `deviceMonitor.*`
- `serviceRegistry.*`
- `lucky.*`
- `ddns.*`
- `sunpanel.*`
- `cloudflare.*`

## 配置来源

当前服务运行时优先级：

```text
.env > central-hub/config/hub.json > 默认值
```

其中 `.env` 会覆盖端口、Lucky/SunPanel/Cloudflare API 地址、Token 与路由器 SSH 凭据。

## 启动方式

```bash
npm start
npm run dev
```

健康检查：

```bash
curl http://localhost:51000/api/health
```

## 已移除的旧接口

以下旧接口/旧叫法不再属于当前实现：

- `GET /api/status`
- `GET /api/ip`
- `GET /api/sunpanel`
- `POST /api/sunpanel/sync`
- `GET /api/sunpanel/cards`
- `cli.mjs sync-all`
- `DDNSController` 作为独立运行入口

如需查看当前可用路由，请以 `central-hub/server.mjs` 和 `central-hub/routes/*.mjs` 为准。
