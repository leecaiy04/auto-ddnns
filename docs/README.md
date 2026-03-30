# Workspace 目录说明

**路径**: `/home/leecaiy/workspace`

这是一个个人工作区，包含自动化脚本、API工具和DDNS相关配置。

## 目录结构

```
workspace/
├── automation/       # 自动化脚本集合
├── ddns_work/        # DDNS动态DNS相关脚本
├── lucky_apis/       # Lucky代理相关API工具
└── scripts/          # 通用脚本集合
```

---

## 📁 automation/

自动化测试和操作脚本，主要用于Web自动化和浏览器控制。

### 主要功能
- **登录自动化**: `auto_login.js`, `simple_login.js`, `login_v2.js`
- **端口管理**: `add_port_*.js` 系列脚本
- **API交互**: `analyze_api.js`, `test_token_api.js`
- **网络监控**: `network_monitor.js`, `capture_network.js`
- **远程Chrome**: `test_remote_chrome.js`, `discover_remote_chrome.js`

### 技术栈
- Node.js / Puppeteer
- 浏览器自动化
- API交互与网络抓包

---

## 📁 ddns_work/

阿里云DDNS动态域名解析服务。

### 核心脚本
- `aliddns_sync.sh` - 主DDNS同步脚本
- `update_ipv4_ddns.sh` - IPv4地址更新
- `update_all_ddns.sh` - 全量DDNS更新
- `crontab_manager.sh` - 定时任务管理
- `start_web.sh` / `ensure_web.sh` - Web服务管理

### 功能
- 自动检测公网IP变化
- 自动更新阿里云DNS记录
- 定时任务调度
- Web服务监控与重启

---

## 📁 lucky_apis/

Lucky代理管理工具的API接口封装。

### 文件说明
- `00_api_documentation.json` - API文档
- `01_port_list.json` - 端口列表数据
- `02_reverseproxy_list.json` - 反向代理配置
- `lucky_api.sh` - API调用脚本
- `port_manager.sh` - 端口管理工具
- `proxy_manager.sh` - 代理管理工具
- `test_apis.sh` / `test_with_token.sh` - API测试脚本

### 日志文件
- `api_requests_log.json` - API请求日志
- `api_responses_log.json` - API响应日志
- `network_traffic.json` - 网络流量记录

---

## 📁 scripts/

通用工具脚本集合。

### 文件说明
- `aliddns_sync.sh` - DDNS同步脚本（副本）
- `windows_chrome_check.ps1` - Windows Chrome检查脚本（PowerShell）

---

## 使用说明

### DDNS服务
```bash
# 手动同步DDNS
cd ddns_work
./aliddns_sync.sh

# 更新IPv4记录
./update_ipv4_ddns.sh
```

### Lucky API
```bash
# 测试API
cd lucky_apis
./test_apis.sh

# 管理端口
./port_manager.sh
```

### 自动化脚本
```bash
cd automation
node auto_login.js
node add_port_final.js
```

---

## 技术栈

- **Shell Script**: bash脚本用于系统自动化
- **Node.js**: JavaScript运行环境
- **Puppeteer**: 浏览器自动化
- **PowerShell**: Windows系统脚本
- **阿里云API**: DDNS服务

---

## 更新日志

- **2026-03-21**: 创建工作区说明文档
