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

# ========== 路由器 ==========
ROUTER_HOST=192.168.3.1
ROUTER_USERNAME=admin
ROUTER_PASSWORD=your-password

# ========== Cloudflare ==========
CF_API_TOKEN=your-token
CF_ZONE_ID=your-zone-id
CF_DOMAIN=example.com
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
| `SUNPANEL_API_BASE` | SunPanel API 地址 | `http://192.168.3.2:20001/openapi/v1` |
| `SUNPANEL_API_TOKEN` | SunPanel API Token | (必填) |
| `SUNPANEL_USERNAME` | Web 登录用户名 | - |
| `SUNPANEL_PASSWORD` | Web 登录密码 | - |
| `SUNPANEL_BACKUP_API_BASE` | 备用节点 API 地址 | - |
| `SUNPANEL_BACKUP_API_TOKEN` | 备用节点 Token | - |

### Lucky 管理

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LUCKY_API_BASE` | Lucky API 地址 | - |
| `LUCKY_OPEN_TOKEN` | Lucky OpenToken | (必填) |
| `LUCKY_USERNAME` | Web 登录用户名 | - |
| `LUCKY_PASSWORD` | Web 登录密码 | - |
| `LUCKY_HTTPS_PORT` | Lucky HTTPS 端口 | `55000` |
| `LUCKY_BACKUP_API_BASE` | 备用节点 API 地址 | - |
| `LUCKY_BACKUP_OPEN_TOKEN` | 备用节点 Token | - |

### Central Hub

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `HUB_PORT` | 服务端口 | `51000` |
| `HUB_HOST` | 监听地址 | `0.0.0.0` |

### 路由器

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `ROUTER_HOST` | 路由器地址 | `192.168.3.1` |
| `ROUTER_USERNAME` | SSH 用户名 | - |
| `ROUTER_PASSWORD` | SSH 密码 | - |

### Cloudflare DNS

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `CF_API_TOKEN` | Cloudflare API Token | - |
| `CF_ZONE_ID` | DNS Zone ID | - |
| `CF_DOMAIN` | 管理的域名 | - |

### 阿里云 DDNS（Lucky 内置）

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `ALIYUN_AK` | 阿里云 AccessKey ID | - |
| `ALIYUN_SK` | 阿里云 AccessKey Secret | - |
| `ALIYUN_DOMAIN` | 主域名 | `leecaiy.shop` |

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
# Central Hub
npm start
# 输出中会显示配置加载状态

# 检查健康
curl http://localhost:51000/api/health
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

## 相关文档

- [Lucky→SunPanel 同步](lucky-to-sunpanel.md)
- [Central Hub](../central-hub/README.md)
- [迁移指南](MIGRATION_GUIDE.md)

## 📞 获取帮助

遇到问题？查看：
1. 各服务的 README.md
2. 项目文档: `docs/`
3. 日志文件: `logs/`
