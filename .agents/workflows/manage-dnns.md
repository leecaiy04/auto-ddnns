---
description: Auto-DNNS 操作指令 (执行各类代理与DNS同步)
---

这是一个 OpenClaw Skill 工作流，用于执行 Auto-DNNS 系统中的各项同步任务。
Auto-DNNS 控制你的基础架构，包括 Lucky 反向代理、Nginx Proxy Manager、Cloudflare DNS、SunPanel 面板以及内部服务器 DDNS。

可以通过这些命令快速执行同步操作。

# 完整自动修复及同步 (一键全家桶)
```sh
// turbo
node d:\Code\Project\auto-dnns\cli.mjs sync-all
```

# 单项能力执行

## 仅执行设备扫描和 DDNS 更新
```sh
// turbo
node d:\Code\Project\auto-dnns\cli.mjs sync-ddns
```

## 仅执行 Lucky 反向代理记录同步
```sh
// turbo
node d:\Code\Project\auto-dnns\cli.mjs sync-lucky
```

## 仅执行 Cloudflare DNS 托管记录同步
```sh
// turbo
node d:\Code\Project\auto-dnns\cli.mjs sync-cloudflare
```

## 仅执行 NPM (Nginx Proxy Manager) 记录同步
```sh
// turbo
node d:\Code\Project\auto-dnns\cli.mjs sync-npm
```

## 仅执行 SunPanel 面板刷新和同步
```sh
// turbo
node d:\Code\Project\auto-dnns\cli.mjs sync-sunpanel
```
