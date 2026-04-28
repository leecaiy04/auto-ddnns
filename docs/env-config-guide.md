# 环境变量配置指南

## 📋 概述

所有服务现在支持通过 `.env` 文件配置敏感信息（如 API Token），`.env` 文件的优先级高于 JSON 配置文件。

## 🔑 优势

1. **安全性**: 将敏感信息集中管理，避免意外提交到 Git
2. **便捷性**: 修改配置无需编辑多个 JSON 文件
3. **灵活性**: 不同环境使用不同的 `.env` 文件
4. **优先级**: 环境变量 > JSON 配置文件 > 默认值

## 📝 配置步骤

### 1. 创建 .env 文件

```bash
# 在项目根目录
cp .env.template .env

# 或手动创建
vim .env
```

### 2. 填写配置

```bash
# ========== SunPanel ==========
SUNPANEL_API_TOKEN=your-sunpanel-api-token
SUNPANEL_API_BASE=http://192.168.3.200:20001/openapi/v1

# ========== Lucky ==========
LUCKY_OPEN_TOKEN=your-lucky-open-token-here
LUCKY_API_BASE=http://192.168.3.200:16601

# ========== Central Hub ==========
HUB_PORT=51000
HUB_HOST=0.0.0.0

# ========== DDNS ==========
DDNS_SCRIPT_PATH=/home/leecaiy/ddns_work/update_all_ddns.sh

# ========== 路由器 ==========
# iKuai Web 子账号（推荐只开放“状态监控 -> 终端监控”）
ROUTER_HOST=192.168.9.1
ROUTER_USERNAME=router_query_ro
ROUTER_PASSWORD=your-r...word
ROUTER_TYPE=ikuai
ROUTER_SSL_VERIFY=0
```

### 3. 设置权限

```bash
chmod 600 .env  # 仅所有者可读写
```

## 📂 文件位置

服务会在以下位置查找 `.env` 文件（按优先级）：

1. `/vol1/1000/code/auto-ddnns/.env` (推荐)
2. `/vol1/1000/code/auto-ddnns/central-hub/.env`
3. 当前工作目录的 `.env`

## 🔧 各服务配置项

### SunPanel 管理

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `SUNPANEL_API_BASE` | SunPanel API 地址 | `http://192.168.3.200:20001/openapi/v1` |
| `SUNPANEL_API_TOKEN` | SunPanel API Token | (必填) |

**使用示例**:
```bash
# 从 .env 读取
node sunpanel-management/src/sunpanel-api.mjs test

# 或直接指定
SUNPANEL_API_TOKEN=xxx node sunpanel-management/src/sunpanel-api.mjs test
```

### Lucky 管理

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LUCKY_API_BASE` | Lucky API 地址 | `http://192.168.3.200:16601` |
| `LUCKY_OPEN_TOKEN` | Lucky OpenToken | (必填) |

**使用示例**:
```bash
# 从 .env 读取
node lucky-management/github-manager.mjs

# 或直接指定
LUCKY_OPEN_TOKEN=xxx node lucky-management/github-manager.mjs
```

### 同步脚本

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LUCKY_API_BASE` | Lucky API 地址 | `http://192.168.3.200:16601` |
| `LUCKY_OPEN_TOKEN` | Lucky OpenToken | (必填) |
| `SUNPANEL_API_BASE` | SunPanel API 地址 | `http://192.168.3.200:20001/openapi/v1` |
| `SUNPANEL_API_TOKEN` | SunPanel API Token | (必填) |

**使用示例**:
```bash
# 使用 .env 配置
node scripts/sync-lucky-to-sunpanel.mjs --sync

# 检查是否加载了 .env
node scripts/sync-lucky-to-sunpanel.mjs --sync 2>&1 | grep ".env"
```

### Central Hub

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `HUB_PORT` | 服务端口 | `3000` |
| `HUB_HOST` | 监听地址 | `0.0.0.0` |
| `LUCKY_API_BASE` | Lucky API 地址 | `http://192.168.3.200:16601` |
| `LUCKY_OPEN_TOKEN` | Lucky OpenToken | (必填) |
| `SUNPANEL_API_BASE` | SunPanel API 地址 | `http://192.168.3.200:20001/openapi/v1` |
| `SUNPANEL_API_TOKEN` | SunPanel API Token | (必填) |
| `DDNS_SCRIPT_PATH` | DDNS 脚本入口（兼容保留） | `./scripts/aliddns_sync.sh` |
| `DDNS_TARGETS_CONFIG` | Python 版 IPv6 DDNS 目标配置 | `./config/private_ipv6_ddns_targets.json` |
| `ROUTER_HOST` | 路由器网关 | `192.168.3.1` |

**使用示例**:
```bash
cd central-hub
npm start  # 自动加载 .env
```

## 🔐 安全建议

### 1. 文件权限

```bash
# 设置为仅所有者可读写
chmod 600 .env

# 验证权限
ls -la .env
# -rw------- 1 leecaiy leecaiy 1.2K Mar 23 16:00 .env
```

### 2. Git 忽略

`.gitignore` 已配置：
```
# Environment variables
.env
.env.local
.env.*.local
```

### 3. 不同环境

为不同环境创建不同的 `.env` 文件：

```bash
# 开发环境
.env.development

# 生产环境
.env.production

# 测试环境
.env.test
```

使用时指定：
```bash
# 加载特定环境的配置
cp .env.production .env
npm start
```

## 🔄 配置优先级

当同一配置在多个地方定义时，优先级如下：

```
环境变量 (.env 或直接指定)
    ↓
JSON 配置文件
    ↓
代码中的默认值
```

**示例**:
```javascript
// 代码中
const token = process.env.SUNPANEL_API_TOKEN || config.token || 'default-token';
```

如果三个地方都有值：
- `.env` 中 `SUNPANEL_API_TOKEN=token-a`
- `config.json` 中 `token: "token-b"`
- 代码默认值 `"default-token"`

实际使用: `token-a` (环境变量优先)

## 🧪 验证配置

### 检查 .env 是否加载

```bash
# SunPanel
node sunpanel-management/src/sunpanel-api.mjs test
# 输出: ✅ 已加载 .env 文件: /path/to/.env

# Lucky
node lucky-management/github-manager.mjs
# 输出: ✅ 已加载 .env 文件: /path/to/.env

# 同步脚本
node scripts/sync-lucky-to-sunpanel.mjs --status
# 输出: ✅ 已加载 .env 文件: /path/to/.env

# Central Hub
cd central-hub && npm start
# 输出: ✅ 已加载 .env 文件: /path/to/.env
```

### 测试 Token 是否有效

```bash
# SunPanel
curl -X POST http://192.168.3.200:20001/openapi/v1/version \
  -H "token: YOUR_TOKEN"

# Lucky
curl http://192.168.3.200:16601/api/webservice/rules \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🐛 故障排除

### .env 文件未生效

**症状**: 修改了 .env 但配置没有更新

**解决**:
1. 检查 .env 文件位置是否正确
2. 确认环境变量名拼写正确
3. 重启服务
4. 查看日志是否有 "已加载 .env 文件" 的消息

### Token 无效

**症状**: API 返回认证错误

**解决**:
1. 检查 Token 是否有引号或空格
   ```bash
   # 错误
   SUNPANEL_API_TOKEN="token"

   # 正确
   SUNPANEL_API_TOKEN=token
   ```

2. 重新获取 Token
   - SunPanel: 管理界面 → OpenAPI 应用
   - Lucky: 设置 → OpenToken

### 配置冲突

**症状**: 环境变量没有生效

**解决**:
```bash
# 检查是否设置了环境变量
echo $SUNPANEL_API_TOKEN

# 检查 .env 文件内容
cat .env | grep SUNPANEL_API_TOKEN

# 确认没有多余的引号
env | grep SUNPANEL
```

## 📚 相关文档

- [SunPanel 管理](../sunpanel-management/README.md)
- [Lucky 管理](../lucky-management/README.md)
- [同步脚本](../docs/lucky-to-sunpanel.md)
- [Central Hub](../central-hub/README.md)

## 📞 获取帮助

遇到问题？查看：
1. 各服务的 README.md
2. 项目文档: `docs/`
3. 日志文件: `logs/`
