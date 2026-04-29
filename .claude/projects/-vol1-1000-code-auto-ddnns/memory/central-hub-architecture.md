---
name: central-hub-architecture
description: Central Hub 编排架构原则和模块间关系
type: project
---

## 核心原则

Central Hub 是唯一的编排中心。各功能模块彼此不调用，所有跨模块数据流通过 Coordinator 调度。

**Why:** 避免模块间耦合，每个模块可独立测试和使用。

**How to apply:**
- 路由中需要跨模块操作时，委托给 `modules.coordinator.runXxx()`
- 路由只读取自己模块的数据（如 `modules.luckyManager.getStatus()`）
- 禁止在模块代码中 `import` 其他模块

## 数据流

```
DeviceMonitor.checkDevices()
    → ipv6Map 写入 state
ServiceRegistry.getProxiedServices()
    → services 列表
LuckyManager.reconcileDDNSTasks()
    → DDNS 任务调和
LuckyManager.syncServicesToLucky(services, ipv6Map)
    → 反向代理规则
LuckyManager.getLuckyProxies() + getLanHost()
    → luckyProxies, luckyLanHost
SunPanelManager.syncToSunPanel(services, luckyProxies, luckyLanHost)
    → 仪表盘卡片
CloudflareManager.syncServicesToCF(services, ipv6Map)
    → DNS 记录
```

## 模块接口约定

- 所有路由工厂函数签名: `function xxxRoutes(modules)` — 接收 modules 字典
- Coordinator 是模块间唯一编排点
- modules 字典中的别名: `modules.lucky` = `modules.luckyManager`, `modules.ddns` = `modules.luckyManager`

## 路由文件

| 文件 | 挂载点 | 说明 |
|------|--------|------|
| dashboard.mjs | /api/dashboard | 概览 + 状态 |
| devices.mjs | /api/devices | 设备发现 |
| services.mjs | /api/services | 服务清单 |
| ddns.mjs | /api/ddns | DDNS 管理 |
| proxy.mjs | /api/proxies | Lucky 代理 |
| cloudflare.mjs | /api/cloudflare | DNS 管理 |
| bookmarks.mjs | /api/bookmarks | 书签 |
| changelog.mjs | /api/changelog | 变更日志 |
| sync.mjs | /api/sync | 同步控制 |
| config.mjs | /api/config | 配置查看 |
