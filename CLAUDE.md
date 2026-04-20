# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目概述

Auto-DNNS (v2.0.0) 是一个局域网网络基础设施自动化工具集。它运行一个 **Central Hub** Express 服务，统一编排设备监控（通过路由器 SSH）、DDNS 更新（阿里云）、反向代理管理（Lucky）、仪表盘卡片同步（SunPanel）和外部 DNS 管理（Cloudflare）。项目界面为中文。

## 常用命令

```bash
npm start            # 生产环境：运行 central-hub/server.mjs
npm run dev          # 开发环境：带 --watch 自动重载
npm test             # 运行所有测试 (node --test test/*.test.mjs)
node --test test/config-loader.test.mjs   # 运行单个测试文件
npm run init         # 首次安装向导
```

无构建步骤 — 纯 ESM Node.js 项目，无需编译。

## 架构

```
路由器 (SSH)
    |
DeviceMonitor ──── 扫描 IPv6 邻居表
    |
ServiceRegistry ── 服务清单 (JSON 文件)
       |              |
  LuckyManager    SunPanelManager    CloudflareManager
  (反向代理+SSL)   (仪表盘卡片)      (DNS A/AAAA 记录)
       \              |              /
    Coordinator ── node-cron 定时调度 (10-15分钟间隔)
          |
    Express API + 仪表盘 (:51000)
```

## 目录结构

```
shared/                        # 共享基础设施
  env-loader.mjs               # .env 文件解析器
  state-manager.mjs            # JSON 状态持久化
  changelog-manager.mjs        # 变更审计日志
  config-loader.mjs            # 配置加载器（.env + hub.json 合并）

modules/                       # 独立功能模块
  device-monitor/              # 设备发现 + DDNS
    index.mjs                  # DeviceMonitor 类
    ssh-client.mjs             # 路由器 SSH2 封装
    ddns-controller.mjs        # 阿里云 DDNS 控制器
  lucky-manager/               # Lucky 反向代理 + SSL
    index.mjs                  # LuckyManager 类
    lucky-api.mjs              # HTTP 传输层
    lucky-port-manager.mjs     # 端口管理
    lucky-reverseproxy.mjs     # 反向代理规则
    lucky-ssl.mjs              # SSL 证书管理
  sunpanel-manager/            # SunPanel 仪表盘卡片
    index.mjs                  # SunPanelManager 类
    sunpanel-api.mjs           # SunPanel OpenAPI 客户端
  cloudflare-manager/          # Cloudflare DNS
    index.mjs                  # CloudflareManager 类
    cloudflare-api.mjs         # Cloudflare API 客户端
  service-registry/            # 服务清单
    index.mjs                  # ServiceRegistry 类

central-hub/                   # 编排层（Express 入口）
  server.mjs                   # Express 服务、模块组装
  coordinator.mjs              # cron 调度器
  routes/                      # API 路由
  public/                      # 前端仪表盘
```

**入口文件**: `central-hub/server.mjs` — 导入各模块、组装、挂载路由。

**模块间数据流**: 通过方法参数传递，不直接引用其他模块。Coordinator 负责编排：
1. `DeviceMonitor.getIPv6Map()` → `ipv6Map`
2. `LuckyManager.syncServicesToLucky(services, ipv6Map)` → 反向代理规则
3. `LuckyManager.getLuckyProxies()` → `luckyProxies`
4. `SunPanelManager.syncToSunPanel(services, luckyProxies, luckyLanHost)` → 仪表盘卡片
5. `CloudflareManager.syncServicesToCF(services, ipv6Map)` → DNS 记录

## 关键设计决策

- **模块独立** — 每个功能模块在 `modules/` 下有独立目录，可单独导入使用
- **无数据库** — 所有状态以 JSON 文件存储（`hub-state.json`、`services-registry.json`、`changelog.json`）
- **全量 ESM** — 仅使用 `import/export`，不使用 `require()`
- **多实例支持** — Lucky 和 SunPanel 支持主节点 + 备用节点（`*_BACKUP_*` 环境变量）
- **自动同步级联** — 服务清单变更自动依次触发 Lucky → SunPanel → Cloudflare 同步

## 配置

环境变量（`.env`）优先级高于 `hub.json`。所有变量见 `.env.template`。

## 开发后台入口

| 服务 | 地址 | 登录方式 |
|------|------|----------|
| Central Hub 仪表盘 | `http://192.168.3.200:51000` | 无需登录，直接访问 |
| Lucky | `http://192.168.3.2:16601` | OpenToken（`LUCKY_OPEN_TOKEN`）；Web 登录（`LUCKY_USERNAME`/`LUCKY_PASSWORD`） |
| SunPanel | `http://192.168.3.2:20001` | API Token（`SUNPANEL_API_TOKEN`）；Web 登录（`SUNPANEL_USERNAME`/`SUNPANEL_PASSWORD`） |
| Cloudflare | `https://dash.cloudflare.com` | API Token（`.env` 中 `CF_API_TOKEN`） |
| 路由器管理 | `http://192.168.3.1` | SSH（`ROUTER_USERNAME`/`ROUTER_PASSWORD`）或 Web 管理页面 |
| 浏览器 MCP | 通过 `.claude/settings.local.json` 中 `shared-chrome` MCP 配置 | 无需额外登录 |

**Lucky OpenToken 获取**: Lucky 设置页 → 安全设置 → OpenToken → 生成并复制

## 部署

- **生产环境**: 通过 `ecosystem.config.cjs` 使用 PM2，应用名 `auto-ddnns`，运行在 FNOS NAS
- **备选方案**: systemd 服务文件 `central-hub/central-hub.service`
- **CI/CD**: `.github/workflows/` — `deploy-main-selfhosted.yml`（推送 main 自动部署）、`deploy-fnos.yml`（手动触发）、`test-main.yml`（运行测试）
- **端口**: 默认 51000（`HUB_PORT`）

## 测试

使用 Node.js 内置的 `node:test` 测试运行器。测试文件位于 `test/`。
