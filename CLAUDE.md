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
   /       |        \
Lucky    SunPanel  Cloudflare
Manager   (经由     Manager
(反向    Lucky     (DNS A/AAAA
 代理)   Manager)   记录)
    \       |        /
  Coordinator ── node-cron 定时调度 (10-15分钟间隔)
        |
  Express API + 仪表盘 (:51000)
```

**入口文件**: `central-hub/server.mjs` — 创建 Express 应用、加载配置、挂载路由、启动定时调度。

**核心模块** (`central-hub/modules/`):
- `config-loader.mjs` — 加载 `.env` + `hub.json`，与环境变量合并（优先级：`.env` > JSON > 默认值）
- `coordinator.mjs` — 所有周期性任务的 cron 调度器
- `device-monitor.mjs` — SSH 连接路由器，解析 IPv6 邻居表
- `service-registry.mjs` — 服务清单的增删改查，存储在 `config/services-registry.json`；变更自动触发同步
- `lucky-manager.mjs` — 同步服务到 Lucky 反向代理 + SunPanel 卡片 + SSL 证书；通过 MD5 哈希比对跳过未变更项
- `cloudflare-manager.mjs` — 同步 DNS 记录到 Cloudflare
- `ddns-controller.mjs` — 执行 `scripts/aliddns_sync.sh` 进行阿里云 DDNS 更新
- `state-manager.mjs` — 基于 JSON 文件的状态持久化，支持备份轮转
- `changelog-manager.mjs` — 所有服务/配置变更的审计日志

**共享库** (`lib/`):
- `ssh-client.mjs` — 路由器命令的 SSH2 封装
- `api-clients/` — Lucky、SunPanel、Cloudflare 的 HTTP API 客户端
- `utils/env-loader.mjs` — `.env` 文件解析器

**API 路由** (`central-hub/routes/`): devices、services、ddns、proxies、cloudflare、sunpanel、bookmarks、changelog、dashboard、config、status。全部挂载在 `/api/` 下。

**前端**: `central-hub/public/` — 原生 HTML/CSS/JS 单页仪表盘，无框架。

## 关键设计决策

- **无数据库** — 所有状态以 JSON 文件存储（`hub-state.json`、`services-registry.json`、`changelog.json`），位于 `central-hub/data/` 和 `central-hub/config/`
- **全量 ESM** — 仅使用 `import/export`，不使用 `require()`
- **多实例支持** — Lucky 和 SunPanel 支持主节点 + 备用节点（`*_BACKUP_*` 环境变量）
- **自动同步级联** — 服务清单变更自动依次触发 Lucky → SunPanel → Cloudflare 同步
- **`_api-bundle/`** — 核心 API 脚本的独立副本，供外部复用；不属于主应用

## 配置

两个 `hub.json` 位置需要保持同步：
- `central-hub/config/hub.json` — `npm start` / `npm run dev` 使用
- `config/hub.json` — CLI 命令使用

环境变量（`.env`）优先级高于 `hub.json`。所有变量见 `.env.template`。

## 部署

- **生产环境**: 通过 `ecosystem.config.cjs` 使用 PM2，应用名 `auto-ddnns`，运行在 FNOS NAS `192.168.3.200`
- **备选方案**: systemd 服务文件 `central-hub/central-hub.service`
- **CI/CD**: `.github/workflows/` — `deploy-main-selfhosted.yml`（推送 main 自动部署）、`deploy-fnos.yml`（手动触发）、`test-main.yml`（ubuntu-latest 运行测试）
- **端口**: 默认 51000（`HUB_PORT`）

## 测试

使用 Node.js 内置的 `node:test` 测试运行器。测试文件位于 `test/`。无 mock 框架 — 测试主要为集成风格，覆盖配置加载、API 客户端构建和模块导入。
