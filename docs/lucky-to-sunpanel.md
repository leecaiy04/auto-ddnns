# Lucky → SunPanel 自动同步工具

自动将 Lucky 反向代理配置同步到 SunPanel 图标卡片。

## 📋 功能特性

- ✅ **自动同步**: 从 Lucky 读取反向代理，自动创建 SunPanel 卡片
- ✅ **增量更新**: 只处理新增、修改的项目
- ✅ **智能分组**: 根据服务类型自动分组
- ✅ **状态跟踪**: 记录同步历史，支持审计
- ✅ **预览模式**: dry-run 查看将要执行的变更
- ✅ **可配置**: 灵活的过滤和映射规则

## 🚀 快速开始

### 1. 配置文件

```bash
# 复制配置模板
cp config/lucky-to-sunpanel.json.template config/lucky-to-sunpanel.json

# 编辑配置
vim config/lucky-to-sunpanel.json
```

### 2. 初始化

```bash
cd /home/leecaiy/workspace/auto-dnns
node scripts/sync-lucky-to-sunpanel.mjs --init
```

这将：
- 测试 Lucky 和 SunPanel API 连接
- 执行首次同步，创建所有卡片

### 3. 查看状态

```bash
node scripts/sync-lucky-to-sunpanel.mjs --status
```

### 4. 手动同步

```bash
node scripts/sync-lucky-to-sunpanel.mjs --sync
```

### 5. 预览模式

```bash
node scripts/sync-lucky-to-sunpanel.mjs --dry-run
```

查看将要执行的变更，但不实际修改。

## ⚙️ 配置说明

### 基本配置

```json
{
  "lucky": {
    "apiBase": "http://192.168.9.200:16601",
    "openToken": "your-lucky-token"
  },
  "sunpanel": {
    "apiBase": "http://192.168.9.200:20001/openapi/v1",
    "apiToken": "your-sunpanel-token",
    "defaultGroupId": 9
  }
}
```

### 同步选项

```json
{
  "sync": {
    "interval": 300,                  // 同步间隔（秒）
    "autoCreateGroups": true,         // 自动创建分组
    "deleteRemoved": false,           // 是否删除已移除的项目
    "saveIcon": true,                 // 是否保存图标到本地
    "onlySyncEnabled": true           // 仅同步启用的代理
  }
}
```

### 分组规则

```json
{
  "groups": {
    "管理面板": {
      "description": "各种管理面板",
      "keywords": ["panel", "admin", "dashboard"],
      "portRanges": [],              // 端口范围 [[start, end]]
      "priority": 1
    },
    "开发工具": {
      "keywords": ["dev", "debug"],
      "portRanges": [[3000, 8999]],   // 3000-8999 端口
      "priority": 2
    }
  }
}
```

### 过滤规则

```json
{
  "exclude": {
    "remarks": ["测试", "test"],              // 排除包含这些关键词的
    "domains": ["test.local", "example.com"], // 排除这些域名
    "ports": [8080]                           // 排除这些端口
  },
  "includeOnly": {
    // 如果设置了，只处理匹配的规则（白名单模式）
    "remarks": [],
    "domains": [],
    "ports": []
  }
}
```

## 🤖 自动同步（可选）

### systemd timer（推荐）

```bash
# 安装服务
cd ~/.config/systemd/user
ln -s /home/leecaiy/workspace/auto-dnns/scripts/sync-lucky-to-sunpanel.service
ln -s /home/leecaiy/workspace/auto-dnns/scripts/sync-lucky-to-sunpanel.timer

# 启用并启动
systemctl --user daemon-reload
systemctl --user enable sync-lucky-to-sunpanel.timer
systemctl --user start sync-lucky-to-sunpanel.timer

# 查看状态
systemctl --user status sync-lucky-to-sunpanel.timer
systemctl --user list-timers
```

### cron

```bash
# 编辑 crontab
crontab -e

# 每 5 分钟执行一次
*/5 * * * * cd /home/leecaiy/workspace/auto-dnns && node scripts/sync-lucky-to-sunpanel.mjs --sync >> /home/leecaiy/workspace/auto-dnns/logs/sync.log 2>&1
```

## 📊 数据映射

| Lucky 字段 | SunPanel 字段 | 示例 |
|-----------|--------------|------|
| Remark | title | "Sun Panel" |
| Domains[0] | url | "https://panel.leecaiy.xyz" |
| Locations[0] | lanUrl | "http://192.168.9.200:20001" |
| Key | onlyName | "panel-leecaiy-xyz" |
| - | iconUrl | "https://panel.leecaiy.xyz/favicon.ico" |

## 🔍 工作流程

```
1. 从 Lucky API 获取反向代理列表
   ↓
2. 根据过滤规则筛选
   ↓
3. 检测变更（新增/修改/删除）
   ↓
4. 匹配 SunPanel 分组
   ↓
5. 调用 SunPanel API 创建/更新卡片
   ↓
6. 更新同步状态
```

## 📝 日志示例

```
[2026-03-23 15:30:00] INFO: 开始同步 Lucky → SunPanel
[2026-03-23 15:30:01] INFO: 从 Lucky 获取反向代理列表...
[2026-03-23 15:30:01] INFO: 找到 12 个反向代理
[2026-03-23 15:30:01] INFO: 过滤后剩余 10 个代理
[2026-03-23 15:30:01] INFO: 变更: 新增 2, 修改 1, 删除 0
[2026-03-23 15:30:02] INFO: [新增] Sun Panel (panel.leecaiy.xyz)
✅ panel-leecaiy-xyz
[2026-03-23 15:30:03] INFO: [新增] Lucky (lucky.leecaiy.xyz)
✅ lucky-leecaiy-xyz
[2026-03-23 15:30:04] INFO: [修改] OpenAI (chat.leecaiy.xyz)
✅ chat-leecaiy-xyz
[2026-03-23 15:30:05] INFO: 同步完成
✅ 同步完成
```

## 🛠️ 故障排除

### 连接失败

```bash
# 检查 Lucky Token
curl -H "Authorization: Bearer YOUR_TOKEN" http://192.168.9.200:16601/api/webservice/rules

# 检查 SunPanel Token
curl -X POST -H "token: YOUR_TOKEN" http://192.168.9.200:20001/openapi/v1/version
```

### 同步不生效

1. 检查过滤规则是否过于严格
2. 确认代理是否已启用（`onlySyncEnabled: true`）
3. 查看日志中的错误信息
4. 使用 `--dry-run` 预览将要执行的操作

### onlyName 冲突

如果两个域名生成相同的 onlyName，后者的会覆盖前者。可以通过调整配置或手动设置 `onlyName` 来解决。

## 📄 文件说明

| 文件 | 说明 |
|------|------|
| `scripts/sync-lucky-to-sunpanel.mjs` | 主同步脚本 |
| `config/lucky-to-sunpanel.json.template` | 配置模板 |
| `data/lucky-to-sunpanel-state.json` | 同步状态（自动生成） |
| `docs/lucky-to-sunpanel-plan.md` | 详细规划文档 |
| `docs/lucky-to-sunpanel.md` | 本文档 |

## 🔄 升级和迁移

### 重置同步状态

```bash
rm data/lucky-to-sunpanel-state.json
node scripts/sync-lucky-to-sunpanel.mjs --init
```

### 更新配置

编辑配置文件后，下次同步会自动使用新配置。

## 📞 支持

如有问题或建议，请查看：
- 规划文档: `docs/lucky-to-sunpanel-plan.md`
- Lucky API: Lucky 管理界面 → OpenAPI
- SunPanel API: https://doc.sun-panel.top/zh_cn/openapi/v1/
