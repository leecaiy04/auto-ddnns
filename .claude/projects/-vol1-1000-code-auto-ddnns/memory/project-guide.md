---
name: project-guide
description: 项目开发约定、部署信息和编码规范
type: project
---

## 技术栈

- 纯 ESM Node.js（无 require），Node >= 18
- Express 作为 HTTP 框架
- node-cron 定时调度
- 无数据库，状态以 JSON 文件存储
- 无前端框架，public/index.html 为原生单页应用

## 编码约定

- 中文注释和用户界面
- 路由工厂函数统一签名 `function xxxRoutes(modules)`
- 模块构造函数: `(config, stateManager)` 或 `(config, stateManager, changelogManager)`
- 错误处理: 路由用 try/catch + res.status(500).json()
- 配置优先级: .env > hub.json > 默认值

## 部署

- PM2: `ecosystem.config.cjs`，应用名 `auto-ddnns`
- systemd: `central-hub/central-hub.service`
- CI/CD: `.github/workflows/` 三个工作流
- 端口: 默认 51000

## 敏感信息

- .env 文件不入库
- ecosystem.config.cjs 中的 SUNPANEL_API_TOKEN 应移到 .env
- 文档中不得出现明文密码或 API Key
