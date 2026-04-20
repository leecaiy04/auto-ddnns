# Auto-DDNNS API 脚本打包说明

本目录用于将原项目中与 **API / SunPanel / Lucky / 路由器 / DDNS** 相关的脚本单独整理，便于你在其他地方复用。

> 说明：这是“复制版”整理，不会改动原项目现有文件。

## 目录结构

```text
_api-bundle/
├─ .env.template
├─ api/
│  ├─ server.mjs
│  ├─ hub-cli.mjs
│  ├─ status.mjs
│  ├─ services.mjs
│  ├─ config.mjs
│  ├─ dashboard.mjs
│  ├─ config-loader.mjs
│  ├─ coordinator.mjs
│  ├─ service-registry.mjs
│  ├─ state-manager.mjs
│  ├─ hub.json
│  └─ central-hub.json.template
├─ sunpanel/
│  ├─ sunpanel-api.mjs
│  ├─ sunpanel.mjs
│  ├─ sunpanel-manager.mjs
│  └─ sync-lucky-to-sunpanel.mjs
├─ lucky/
│  ├─ lucky-api.mjs
│  ├─ lucky-port-manager.mjs
│  ├─ lucky-reverseproxy.mjs
│  ├─ lucky-manager.mjs
│  ├─ lucky-sync.mjs
│  └─ proxy.mjs
├─ router/
│  ├─ router-monitor.mjs
│  ├─ device-monitor.mjs
│  ├─ devices.mjs
│  └─ ip.mjs
└─ ddns/
   ├─ aliddns_sync.sh
   ├─ ddns-controller.mjs
   └─ ddns.mjs
```

## 分类说明

- **api/**：中枢服务 API 入口、路由与基础模块
- **sunpanel/**：SunPanel API 客户端与同步相关脚本
- **lucky/**：Lucky API 客户端与代理管理相关脚本
- **router/**：路由器设备发现、IP/设备接口相关脚本
- **ddns/**：DDNS 执行脚本与 API 控制模块

## 使用建议

1. 先复制 `.env.template` 为 `.env` 并填写令牌/地址配置。
2. 按需将对应子目录放入目标项目。
3. 如果要单独运行 `api/server.mjs`，请确保其依赖路径在目标项目中可解析（当前为按原仓库结构复制，可能需要你在目标项目调整 import 路径）。

## 来源

来源仓库：`auto-ddnns`（当前工作区复制生成）
