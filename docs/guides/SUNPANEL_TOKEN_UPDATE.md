# 如何更新 SunPanel API Token

## 问题
SunPanel 使用两种不同的 Token：
1. **OpenAPI Token** - 用于 OpenAPI 端点（`/openapi/v1/*`），但功能有限
2. **内部 API Token** - 用于内部端点（`/api/*`），功能完整

当前 `.env` 中的 token 是 OpenAPI token，但内部 API token 已过期，导致无法获取完整的卡片列表。

## 解决方案 1：通过浏览器获取新 Token

1. 打开浏览器，访问 SunPanel: http://192.168.9.2:20001
2. 打开浏览器开发者工具（F12）
3. 切换到 **Network** 标签
4. 登录 SunPanel
5. 在 Network 标签中找到登录请求（通常是 `/api/login/account`）
6. 查看响应，复制 `data.token` 的值
7. 更新 `.env` 文件中的 `SUNPANEL_API_TOKEN`

## 解决方案 2：手动指定要删除的卡片

如果无法获取新 token，可以手动指定要删除的卡片列表：

```bash
curl -X POST http://192.168.9.200:51000/api/services/purge-remote \
  -H "Content-Type: application/json" \
  -d '{"sunpanelOnlyNames": ["svc-fnos", "svc-app", "svc-nas"]}'
```

## 解决方案 3：直接通过 SunPanel Web 界面删除

1. 访问 http://192.168.9.2:20001
2. 登录后手动删除不需要的卡片
3. 清空本地同步状态：访问 http://192.168.9.200:51000 → 点击"清空远端数据库"

## 技术说明

当前的自动登录功能尝试通过 `/api/login/account` 端点获取新 token，但该端点返回 HTML 而不是 JSON，可能是因为：
- SunPanel 需要先设置 cookie
- 登录端点需要 CSRF token
- 或者需要其他认证机制

建议使用解决方案 1 通过浏览器手动获取 token。
