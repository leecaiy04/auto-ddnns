# Lucky 到 SunPanel 自动化同步方案

## 📋 需求概述

实现从 Lucky 反向代理配置自动生成 SunPanel 图标卡片的自动化脚本，支持增量更新。

## 🎯 功能目标

1. **自动同步**: 从 Lucky 读取反向代理配置，自动在 SunPanel 创建对应卡片
2. **增量更新**: 只处理新增、修改、删除的项目
3. **智能分组**: 根据服务类型自动分组到 SunPanel
4. **状态跟踪**: 记录同步状态，支持回滚和审计
5. **可配置**: 灵活的映射规则和配置选项

## 🏗️ 架构设计

```
┌─────────────────┐
│  Lucky API      │
│  反向代理列表    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  同步引擎        │
│  - 数据映射      │
│  - 增量检测      │
│  - 状态跟踪      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SunPanel API   │
│  创建/更新卡片   │
└─────────────────┘
```

## 📊 数据映射规则

### Lucky 反向代理 → SunPanel 卡片

| Lucky 字段 | SunPanel 字段 | 处理逻辑 |
|-----------|--------------|---------|
| Remark | title | 直接使用 |
| Domains[0] | url | https:// + domain |
| Locations[0] | lanUrl | 内网地址 |
| Key | onlyName | 转换为小写+连字符 |
| Domains[0] | iconUrl | /favicon.ico |
| Enable | - | 仅同步启用的代理 |

### onlyName 生成规则

```
域名: panel.leecaiy.xyz
↓ 去除协议
panel.leecaiy.xyz
↓ 替换 . 为 -
panel-leecaiy-xyz
↓ 转小写
panel-leecaiy-xyz
```

### 智能分组规则

| 服务特征 | SunPanel 分组 |
|---------|--------------|
| 端口 3000-8999 | 开发工具 |
| 端口 20000-30000 | 管理面板 |
| 端口 8080-8090, 3000 | Web 服务 |
| 域名包含 'panel', 'admin' | 管理面板 |
| 域名包含 'api', 'gateway' | API |
| 其他 | 工具 |

## 🔄 增量更新机制

### 状态跟踪

使用 JSON 文件记录同步状态：

```json
{
  "lastSync": "2026-03-23T15:30:00Z",
  "items": {
    "panel-leecaiy-xyz": {
      "luckyKey": "xxx-xxx-xxx",
      "sunpanelOnlyName": "panel-leecaiy-xyz",
      "luckyHash": "abc123",
      "lastUpdate": "2026-03-23T15:30:00Z",
      "status": "synced"
    }
  }
}
```

### 变更检测

1. **新增**: Lucky 有但状态文件中没有
2. **修改**: Lucky 配置 hash 变更
3. **删除**: Lucky 没有但状态文件中有

### Hash 计算

```javascript
function calculateHash(proxy) {
  const data = `${proxy.Remark}|${proxy.Domains.join(',')}|${proxy.Locations.join(',')}|${proxy.Enable}`;
  return crypto.createHash('md5').update(data).digest('hex');
}
```

## 📁 文件结构

```
auto-dnns/
├── scripts/
│   ├── sync-lucky-to-sunpanel.mjs      # 主同步脚本
│   └── sync-lucky-to-sunpanel.service  # systemd 服务
├── config/
│   └── lucky-to-sunpanel.json          # 配置文件
├── data/
│   └── lucky-to-sunpanel-state.json    # 状态跟踪文件
└── docs/
    └── lucky-to-sunpanel.md            # 使用文档
```

## ⚙️ 配置文件

```json
{
  "lucky": {
    "apiBase": "http://192.168.3.200:16601",
    "openToken": "your-token"
  },
  "sunpanel": {
    "apiBase": "http://192.168.3.200:20001/openapi/v1",
    "apiToken": "your-token",
    "defaultGroupId": 9
  },
  "sync": {
    "interval": 300,                    // 同步间隔（秒）
    "autoCreateGroups": true,           // 自动创建分组
    "deleteRemoved": false,             // 是否删除已移除的项目
    "saveIcon": true                    // 是否保存图标到本地
  },
  "groups": {
    "管理面板": {
      "keywords": ["panel", "admin", "dashboard"],
      "priority": 1
    },
    "API": {
      "keywords": ["api", "gateway"],
      "priority": 2
    },
    "开发工具": {
      "portRanges": [[3000, 8999]],
      "priority": 3
    },
    "Web 服务": {
      "ports": [8080, 8090, 3000],
      "priority": 4
    }
  }
}
```

## 🚀 执行流程

### 初始化

```bash
# 1. 配置文件
cp config/lucky-to-sunpanel.json.template config/lucky-to-sunpanel.json
vim config/lucky-to-sunpanel.json

# 2. 首次同步
node scripts/sync-lucky-to-sunpanel.mjs --init

# 3. 启用定时同步
systemctl --user enable sync-lucky-to-sunpanel.service
systemctl --user start sync-lucky-to-sunpanel.service
```

### 定时同步

```bash
# 手动触发同步
node scripts/sync-lucky-to-sunpanel.mjs --sync

# 查看同步状态
node scripts/sync-lucky-to-sunpanel.mjs --status

# 预览同步内容（不实际执行）
node scripts/sync-lucky-to-sunpanel.mjs --dry-run
```

## 📊 日志和监控

### 日志级别

- **INFO**: 同步操作记录
- **WARN**: 配置不一致
- **ERROR**: API 调用失败
- **DEBUG**: 详细调试信息

### 日志示例

```
[2026-03-23 15:30:00] INFO: 开始同步 Lucky → SunPanel
[2026-03-23 15:30:01] INFO: 从 Lucky 获取到 12 个反向代理
[2026-03-23 15:30:01] INFO: 检测到变更: 新增 2, 修改 1, 删除 0
[2026-03-23 15:30:02] INFO: [新增] panel.leecaiy.xyz → SunPanel
[2026-03-23 15:30:03] INFO: [新增] api.leecaiy.xyz → SunPanel
[2026-03-23 15:30:04] INFO: [修改] panel.leecaiy.xyz 更新图标
[2026-03-23 15:30:05] INFO: 同步完成，耗时 5 秒
```

## 🔒 安全考虑

1. **Token 管理**: 使用环境变量或加密存储
2. **API 限流**: 请求频率控制
3. **错误处理**: 失败重试机制
4. **备份**: 同步前自动备份状态

## 🧪 测试计划

### 单元测试

- [ ] onlyName 生成规则
- [ ] 分组匹配逻辑
- [ ] Hash 计算准确性
- [ ] 变更检测算法

### 集成测试

- [ ] Lucky API 连接
- [ ] SunPanel API 连接
- [ ] 完整同步流程
- [ ] 增量更新准确性

### 人工测试

- [ ] 首次初始化
- [ ] 新增代理同步
- [ ] 修改代理同步
- [ ] 删除代理处理
- [ ] 异常场景处理

## 📝 待办事项

- [ ] 创建配置文件模板
- [ ] 实现数据映射函数
- [ ] 实现增量检测逻辑
- [ ] 实现主同步脚本
- [ ] 添加日志系统
- [ ] 创建 systemd 服务文件
- [ ] 编写使用文档
- [ ] 添加单元测试
- [ ] 性能优化
- [ ] 错误处理增强

## 🎉 预期效果

1. **自动化**: 无需手动在 SunPanel 添加卡片
2. **实时性**: 5 分钟内自动同步变更
3. **准确性**: 100% 覆盖启用的反向代理
4. **可靠性**: 失败自动重试，支持回滚
5. **可维护**: 清晰的日志和状态跟踪
