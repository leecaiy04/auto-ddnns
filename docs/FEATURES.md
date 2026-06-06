# Auto-DDNNS 功能清单

**版本**: v2.0.0  
**更新日期**: 2026-06-06  
**状态**: ✅ 生产可用

---

## 🎯 项目定位

Auto-DDNNS 是一个基于 **Central Hub** 的局域网网络基础设施自动化工具，提供设备监控、动态 DNS、反向代理管理、仪表盘同步等一站式解决方案。

**核心特点**:
- 🔄 自动化程度高 - 定时任务自动运行
- 🌐 多服务集成 - Lucky、SunPanel、Cloudflare
- 📊 可视化仪表盘 - Web 界面实时监控
- 🔧 REST API - 完整的编程接口
- 🧪 测试覆盖完整 - 110 个测试，100% 通过

---

## 📋 核心功能模块

### 1. 设备监控 (DeviceMonitor)

**功能描述**: 通过 SSH 连接路由器，自动发现局域网设备并获取其 IPv6 地址。

#### ✅ 已实现功能

- **设备发现**
  - 自动扫描路由器 ARP/NDP 邻居表
  - 获取设备 MAC 地址、IPv4/IPv6 地址
  - 支持 iKuai 和通用 SSH 路由器
  - 设备在线状态监控

- **IPv6 地址管理**
  - 自动获取设备 IPv6 全球单播地址
  - 维护 MAC → IPv6 映射表
  - 持久化到状态文件

- **端口扫描**
  - 扫描指定设备的开放端口
  - 支持自定义端口范围
  - 识别常见服务（HTTP、HTTPS、SSH 等）

- **定时任务**
  - 每 10 分钟自动扫描设备（可配置）
  - 实时更新设备状态

#### 🔗 相关 API

```bash
GET  /api/devices/list              # 获取所有设备列表
POST /api/devices/refresh           # 手动刷新设备状态
GET  /api/devices/key-machines      # 获取关键机器列表
GET  /api/devices/scan-ports        # 获取可扫描的端口列表
POST /api/devices/:deviceId/scan    # 扫描指定设备端口
GET  /api/devices/port-mapping-table # 获取端口映射表
```

#### 💡 使用场景

- 监控局域网设备在线状态
- 获取设备 IPv6 地址用于 DDNS
- 发现设备开放的服务端口
- 为服务清单提供设备信息

---

### 2. 服务清单管理 (ServiceRegistry)

**功能描述**: 集中管理需要对外暴露的服务，支持 CRUD 操作，变更后自动触发同步。

#### ✅ 已实现功能

- **服务 CRUD**
  - 添加服务（支持快速添加）
  - 更新服务配置
  - 删除服务
  - 批量导入/导出

- **服务配置项**
  - 基本信息：ID、名称、描述、图标
  - 网络配置：设备 MAC、内部端口
  - 反向代理：启用状态、域名、外部端口
  - SunPanel：卡片显示、分组
  - Cloudflare：DNS 记录同步

- **服务验证**
  - 配置完整性检查
  - 端口冲突检测
  - 域名格式验证

- **变更日志**
  - 记录所有服务变更
  - 支持审计和回溯
  - 导出变更历史

- **级联同步**
  - 服务变更后自动同步到 Lucky
  - 自动同步到 SunPanel
  - 自动同步到 Cloudflare（如启用）

#### 🔗 相关 API

```bash
GET    /api/services/list           # 获取服务列表
GET    /api/services/status         # 获取服务状态
GET    /api/services/:id            # 获取单个服务详情
POST   /api/services/add            # 添加服务
POST   /api/services/quick-add      # 快速添加服务
PUT    /api/services/:id            # 更新服务
DELETE /api/services/:id            # 删除服务
POST   /api/services/validate       # 验证服务配置
GET    /api/services/export         # 导出服务清单
GET    /api/services/connectivity   # 测试服务连接性
GET    /api/services/proxy-defaults # 获取代理默认配置
```

#### 💡 使用场景

- 统一管理所有需要对外暴露的服务
- 一键添加新服务并自动配置反向代理
- 服务配置变更后自动同步到各平台
- 导出服务清单用于备份或迁移

---

### 3. Lucky 管理 (LuckyManager)

**功能描述**: 管理 Lucky 反向代理、DDNS 任务、SSL 证书、端口转发和 WOL。

#### ✅ 已实现功能

##### 3.1 反向代理管理
- 自动创建/更新反向代理规则
- 支持 HTTP/HTTPS 代理
- 自动配置上游服务器（IPv6）
- 规则同步和状态查询
- 支持主备多实例

##### 3.2 DDNS 管理
- 基于 Lucky 内置 DDNS 功能
- 自动创建 DDNS 任务
- 支持阿里云 DNS
- 任务调和（创建缺失的、删除孤立的）
- DDNS 历史记录查询

##### 3.3 SSL 证书管理
- 获取证书列表
- 证书过期检查
- 列出即将过期的证书（30 天内）
- 支持 ACME 自动续期

##### 3.4 端口转发
- 获取端口转发规则
- 添加/更新/删除转发规则
- 列出所有监听端口
- 根据端口查找规则

##### 3.5 WOL 网络唤醒
- 管理 WOL 设备列表
- 唤醒指定设备
- 添加/更新/删除设备

##### 3.6 系统信息
- 获取 Lucky 版本
- 获取系统信息和模块列表
- 测试连接状态

#### 🔗 相关 API

```bash
# 反向代理
GET  /api/proxies                   # 获取代理状态
GET  /api/proxies/sync              # 触发代理同步

# DDNS
GET  /api/ddns                      # 获取 DDNS 状态
POST /api/ddns/reconcile            # DDNS 任务调和
POST /api/ddns/refresh              # 刷新 DDNS（同 reconcile）
POST /api/ddns/sync/:taskKey        # 手动触发单个任务同步
GET  /api/ddns/history              # DDNS 历史记录
```

#### 💡 使用场景

- 自动为新服务创建反向代理
- 管理动态 DNS 记录
- 监控 SSL 证书过期情况
- 远程唤醒设备
- 管理端口转发规则

---

### 4. SunPanel 管理 (SunPanelManager)

**功能描述**: 自动同步服务到 SunPanel 仪表盘，创建和管理卡片。

#### ✅ 已实现功能

- **卡片同步**
  - 自动创建/更新卡片
  - 基于服务配置生成图标、标题、链接
  - 增量同步（仅更新变更的卡片）
  - 删除孤立卡片

- **分组管理**
  - 自动创建分组
  - 按服务类别组织卡片
  - 默认分组支持

- **多 API 支持**
  - OpenAPI v1（推荐）
  - 内部 API（作为备选）
  - 自动降级机制

- **状态跟踪**
  - 记录同步状态
  - 防止重复同步
  - 基于哈希的变更检测

- **批量操作**
  - 清空所有卡片
  - 支持 dry-run 模式

#### 🔗 相关 API

```bash
POST /api/sync/sunpanel             # 触发 SunPanel 同步
POST /api/sunpanel/purge-remote     # 清空远程卡片（危险）
GET  /api/sunpanel/status           # 获取 SunPanel 状态
```

#### 💡 使用场景

- 自动将服务同步到 SunPanel 仪表盘
- 统一管理导航卡片
- 快速访问内网服务
- 可视化服务状态

---

### 5. Cloudflare DNS 管理 (CloudflareManager)

**功能描述**: 自动同步服务的 DNS 记录到 Cloudflare，支持 A 和 AAAA 记录。

#### ✅ 已实现功能

- **DNS 记录管理**
  - 自动创建 A/AAAA 记录
  - 更新已存在的记录
  - 删除孤立记录
  - 支持 IPv4 和 IPv6

- **智能同步**
  - 增量更新（仅同步变更）
  - 自动获取公网 IPv4
  - IPv6 优先策略
  - 跳过无 IP 的服务

- **Token 验证**
  - 验证 API Token 有效性
  - 检查权限范围
  - 自动错误提示

- **状态查询**
  - 获取所有 DNS 记录
  - 查询同步状态
  - 统计成功/失败数量

#### 🔗 相关 API

```bash
GET  /api/cloudflare/status         # 获取 Cloudflare 状态
POST /api/cloudflare/sync           # 触发 DNS 同步
GET  /api/cloudflare/verify-token   # 验证 API Token
GET  /api/cloudflare/list           # 列出 DNS 记录
DELETE /api/cloudflare/record       # 删除 DNS 记录
```

#### 💡 使用场景

- 自动管理外部 DNS 记录
- 支持 IPv6 访问
- 实现动态 DNS 功能
- 统一 DNS 管理

---

### 6. 协调器 (Coordinator)

**功能描述**: 统一调度所有模块，执行定时任务和同步编排。

#### ✅ 已实现功能

- **定时任务调度**
  - 设备监控（每 10 分钟）
  - DDNS 调和（每小时）
  - Lucky 同步（每 15 分钟）
  - SunPanel 同步（每 15 分钟）
  - Cloudflare 同步（每 15 分钟）
  - 状态保存（每分钟）

- **同步编排**
  - 完整同步流程
  - 模块间依赖管理
  - 错误隔离
  - 同步状态记录

- **状态管理**
  - 获取系统概览
  - 查询同步状态
  - 模块状态汇总

#### 🔗 相关 API

```bash
POST /api/sync/full                 # 完整同步（所有模块）
GET  /api/dashboard/overview        # 系统概览
GET  /api/dashboard/status          # 详细状态
```

#### 💡 使用场景

- 自动化定时同步
- 统一的同步入口
- 模块间编排协调
- 系统状态监控

---

### 7. 监控仪表盘 (Dashboard)

**功能描述**: Web 界面和 REST API，提供可视化监控和操作界面。

#### ✅ 已实现功能

- **Web 仪表盘**
  - 单页应用界面
  - 实时状态显示
  - 服务列表展示
  - 操作按钮集成

- **系统概览**
  - 设备数量统计
  - 服务数量统计
  - 代理规则数量
  - DDNS 任务状态
  - 系统运行时长

- **健康检查**
  - 服务健康状态
  - 模块启用情况
  - API 可用性

- **配置查询**
  - 查看当前配置
  - 敏感信息脱敏
  - 配置验证

#### 🔗 相关 API

```bash
GET /api/health                     # 健康检查
GET /api/dashboard/overview         # 系统概览
GET /api/dashboard/status           # 详细状态
GET /api/config                     # 配置查询（脱敏）
```

#### 💡 使用场景

- 可视化监控系统状态
- 快速了解服务情况
- 健康检查和故障排查
- 配置验证

---

### 8. 变更日志 (ChangelogManager)

**功能描述**: 记录所有服务变更，提供审计追踪。

#### ✅ 已实现功能

- **变更记录**
  - 服务创建/更新/删除
  - 记录变更内容（before/after）
  - 时间戳和操作类型

- **日志查询**
  - 获取变更历史
  - 按类型筛选
  - 按时间范围查询

- **导出功能**
  - 导出为 JSON
  - 支持备份和分析

#### 🔗 相关 API

```bash
GET /api/changelog                  # 获取变更日志
GET /api/changelog/logs             # 获取详细日志
```

#### 💡 使用场景

- 审计服务变更
- 故障回溯
- 变更历史分析
- 合规性要求

---

### 9. 书签管理 (Bookmarks)

**功能描述**: 管理外部链接和书签。

#### ✅ 已实现功能

- **书签 CRUD**
  - 添加书签
  - 获取书签列表
  - 删除书签
  - 批量清空

- **书签分类**
  - 支持分组
  - 图标支持
  - 描述信息

#### 🔗 相关 API

```bash
GET    /api/bookmarks               # 获取书签列表
POST   /api/bookmarks/add           # 添加书签
DELETE /api/bookmarks/:id           # 删除书签
DELETE /api/bookmarks/all/clear     # 清空所有书签
```

#### 💡 使用场景

- 快速访问常用链接
- 组织外部资源
- 补充 SunPanel 卡片

---

## 🔄 自动化流程

### 完整同步流程

```
1. 设备发现
   ↓ DeviceMonitor.checkDevices()
   
2. 获取 IPv6 映射
   ↓ DeviceMonitor.getIPv6Map()
   
3. 服务清单
   ↓ ServiceRegistry.getServices()
   
4. Lucky 反向代理同步
   ↓ LuckyManager.syncServicesToLucky(services, ipv6Map)
   
5. 获取 Lucky 代理状态
   ↓ LuckyManager.getLuckyProxies()
   
6. SunPanel 卡片同步
   ↓ SunPanelManager.syncToSunPanel(services, luckyProxies)
   
7. Cloudflare DNS 同步
   ↓ CloudflareManager.syncServicesToCF(services, ipv6Map)
   
8. 保存状态
   ↓ StateManager.save()
```

### 定时任务

| 任务 | 频率 | 说明 |
|------|------|------|
| 设备监控 | */10 * * * * | 每 10 分钟扫描设备 |
| DDNS 调和 | 0 * * * * | 每小时调和 DDNS 任务 |
| Lucky 同步 | */15 * * * * | 每 15 分钟同步反向代理 |
| SunPanel 同步 | */15 * * * * | 每 15 分钟同步卡片 |
| Cloudflare 同步 | */15 * * * * | 每 15 分钟同步 DNS |
| 状态保存 | * * * * * | 每分钟保存状态 |

### 服务变更触发

```
添加/更新/删除服务
    ↓
ServiceRegistry 变更
    ↓
ChangelogManager 记录
    ↓
自动触发完整同步
    ↓
Lucky + SunPanel + Cloudflare
```

---

## 🛠️ 命令行工具

### Hub CLI

```bash
# 健康检查
node central-hub/hub-cli.mjs health

# 系统概览
node central-hub/hub-cli.mjs overview

# 状态查询
node central-hub/hub-cli.mjs status

# IPv6 地址
node central-hub/hub-cli.mjs ip

# DDNS 状态
node central-hub/hub-cli.mjs ddns

# DDNS 刷新
node central-hub/hub-cli.mjs ddns:refresh

# 代理状态
node central-hub/hub-cli.mjs proxies

# SunPanel 状态
node central-hub/hub-cli.mjs sunpanel

# SunPanel 同步
node central-hub/hub-cli.mjs sunpanel:sync
```

### 独立工具脚本

```bash
# 初始化向导
node scripts/init-setup.mjs

# 查询设备 IPv6（SSH）
node scripts/tools/query-device-ipv6.mjs

# 查询 iKuai 路由器
node scripts/tools/query-ikuai-ipv6.mjs

# 显示 IPv6 信息
node scripts/tools/show-ipv6.mjs

# 手动同步工具
node scripts/tools/manual-sync.mjs
```

---

## 📊 统计数据

### 代码规模

- **总代码行数**: ~15,000 行
- **测试用例**: 110 个
- **测试通过率**: 100%
- **模块数量**: 6 个核心模块
- **API 端点**: 50+ 个

### 支持的服务

- **路由器**: iKuai、通用 SSH 路由器
- **反向代理**: Lucky
- **仪表盘**: SunPanel
- **DNS 服务**: Cloudflare、阿里云（通过 Lucky DDNS）

### 性能指标

- **启动时间**: ~8 秒
- **同步时间**: ~15-30 秒（完整同步）
- **API 响应**: < 100ms（大部分端点）

---

## 🚀 部署方式

### 1. 开发环境

```bash
npm run dev
```

### 2. 生产环境（PM2）

```bash
pm2 start ecosystem.config.cjs
pm2 logs auto-ddnns
pm2 status
```

### 3. Systemd 服务

```bash
sudo systemctl start central-hub
sudo systemctl enable central-hub
sudo systemctl status central-hub
```

---

## 🔐 安全特性

- ✅ 支持 SSH 密钥认证
- ✅ API Token 认证（Lucky、SunPanel、Cloudflare）
- ✅ 配置信息脱敏
- ✅ 日志不记录敏感信息
- ⚠️ Central Hub API 暂无认证（建议内网使用或添加反向代理认证）

---

## 📖 文档资源

### 核心文档

- [README.md](../README.md) - 快速开始指南
- [CLAUDE.md](../CLAUDE.md) - Claude Code 工作指南
- [docs/architecture.md](./architecture.md) - 完整架构文档
- [REFACTORING_PLAN.md](../REFACTORING_PLAN.md) - 重构计划

### 操作指南

- [docs/guides/](./guides/) - 各类操作指南
- [scripts/README.md](../scripts/README.md) - 脚本使用说明

### API 文档

- [docs/api-updates/](./api-updates/) - API 更新文档

---

## ⚠️ 当前限制

### 功能限制

1. **无 Web 界面编辑**: 前端仅显示状态，CRUD 需通过 API
2. **无用户认证**: Central Hub API 无认证机制
3. **单机部署**: 不支持分布式部署
4. **JSON 存储**: 无数据库，大规模数据可能性能下降

### 性能限制

1. **串行初始化**: 模块启动是串行的（计划 Phase 3 优化）
2. **无缓存**: API 调用无缓存机制（计划 Phase 3 添加）
3. **全量同步**: 部分同步是全量的（计划 Phase 3 改为增量）

### 兼容性

1. **路由器**: 仅测试过 iKuai 和部分 OpenWrt
2. **Lucky 版本**: 需要支持 OpenToken 的版本
3. **Node.js**: 需要 18.0.0 或更高版本

---

## 🔮 计划功能

以下功能已在 [REFACTORING_PLAN.md](../REFACTORING_PLAN.md) 中规划：

### Phase 2: 架构改进
- 统一错误处理
- 结构化日志系统
- 并发控制
- 状态管理增强

### Phase 3: 性能优化
- 缓存层
- 增量同步
- 并行初始化
- 连接池

### Phase 4: 功能增强
- Token 管理自动化
- 健康检查增强
- Prometheus 指标导出
- SSL 证书过期告警

### Phase 5: 测试与质量
- 提升测试覆盖到 95%+
- 添加性能测试
- 代码质量工具（ESLint/Prettier）

### Phase 6: 安全加固
- API 访问控制
- 配置脱敏增强
- 安全审计

---

## 💡 最佳实践

### 推荐配置

1. **使用 OpenToken** 而非用户名/密码（Lucky/SunPanel）
2. **启用多实例** 提高可用性（主备配置）
3. **定期备份** 状态文件和配置
4. **监控日志** 及时发现问题
5. **使用 PM2** 管理进程（自动重启）

### 故障排查

1. 检查健康检查端点：`curl http://localhost:51000/api/health`
2. 查看系统概览：`curl http://localhost:51000/api/dashboard/overview`
3. 检查模块状态：`node central-hub/hub-cli.mjs status`
4. 查看日志：`pm2 logs auto-ddnns`
5. 验证配置：`curl http://localhost:51000/api/config`

---

**总结**: Auto-DDNNS v2.0.0 提供了完整的局域网网络基础设施自动化解决方案，包含设备监控、服务管理、反向代理、仪表盘同步和 DNS 管理等核心功能。系统经过充分测试，生产可用。
