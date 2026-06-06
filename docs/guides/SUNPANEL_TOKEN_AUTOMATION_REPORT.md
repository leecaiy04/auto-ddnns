# SunPanel Token 自动化与清空功能研究报告

**日期**: 2026-06-06  
**状态**: ✅ Token 自动化完成 | ⚠️ API 删除不可用

---

## 🎯 任务目标

1. 实现 SunPanel Token 自动获取
2. 修复"清空远端数据库"功能
3. 验证 SunPanel 卡片删除功能

---

## ✅ 已完成的工作

### 1. 自动 Token 获取系统

**脚本**: `scripts/fully-automated-token.mjs`

**功能**:
- ✅ 使用 CDP 连接远程 Chrome (192.168.9.10:18801)
- ✅ 自动清除所有认证数据（localStorage, sessionStorage, cookies, cache）
- ✅ 导航到 `/login` 页面
- ✅ 自动填写用户名和密码
- ✅ 提交登录表单
- ✅ 监听并捕获 `localStorage.AUTH_TOKEN.data.token`
- ✅ 自动更新 `.env` 文件

**关键发现**:
- SunPanel 登录页面在 `/login` 路径（不是主页 `/`）
- Token 存储在 `localStorage.AUTH_TOKEN.data.token`
- 清除缓存后访问主页 `/` 仍显示缓存内容，必须访问 `/login`

**测试结果**:
```bash
$ node scripts/fully-automated-token.mjs
✅ 成功捕获 token!
📋 Token: 9d959cc4-c913-475e-8276-0087d5585364-7b188a16cd16f2c3f6435e35e6c7d6bc
💾 .env 文件已更新!
```

### 2. 服务器配置修复

**文件**: `central-hub/server.mjs`

**修改**:
```javascript
// 添加 username 和 password 到 SunPanel 实例配置
if (process.env.SUNPANEL_API_BASE) {
  sunInstances.push({
    apiBase: process.env.SUNPANEL_API_BASE,
    apiToken: process.env.SUNPANEL_API_TOKEN,
    username: process.env.SUNPANEL_USERNAME,  // ✅ 新增
    password: process.env.SUNPANEL_PASSWORD   // ✅ 新增
  });
}
```

**影响**: SunPanelManager 现在可以访问用户名和密码进行自动登录

### 3. API 功能验证

**已验证的工作功能**:
- ✅ 获取所有分组: `/api/panel/itemIcon/getListAllGroup`
- ✅ 获取分组列表: `/api/panel/itemIconGroup/getList`
- ✅ `listAllItems()` 函数正常工作

**测试结果**:
```bash
$ node scripts/test-list-all-items.mjs
✅ 成功获取 3 个卡片:
  - FNOS 系统 (svc-fnos)
  - Lucky 管理面板 (svc-lucky200)
  - openclaw (svc-openclaw)
```

---

## ⚠️ 核心问题：SunPanel 删除 API 不可用

### 问题描述

**所有删除 API 端点都返回 HTML 而不是 JSON：**

1. **OpenAPI**: `/openapi/v1/item/delete`
   ```bash
   $ curl -X POST http://192.168.9.2:20001/openapi/v1/item/delete \
     -H "token: $TOKEN" \
     -d '{"onlyName": "svc-fnos"}'
   # 返回: <!DOCTYPE html>...
   ```

2. **内部 API**: `/api/panel/itemIcon/delete`
   ```bash
   $ curl -X POST http://192.168.9.2:20001/api/panel/itemIcon/delete \
     -H "Content-Type: application/json" \
     -d '{"id": 264}'
   # 返回: <!DOCTYPE html>...
   ```

### 测试过的方法

| 方法 | 结果 | 备注 |
|------|------|------|
| 使用 Token Header | ❌ 返回 HTML | Token 从 localStorage 获取 |
| 使用浏览器 fetch | ❌ 返回 HTML | 自动携带认证状态 |
| 使用 CDP 控制浏览器 | ❌ 返回 HTML | 完全模拟浏览器环境 |
| 手动 Cookie | ❌ 无 Cookie | `document.cookie` 为空 |
| 通过 ID 删除 | ❌ 返回 HTML | 尝试 `{id: 264}` |
| 通过 onlyName 删除 | ❌ 返回 HTML | 尝试 `{onlyName: "..."}` |

### 技术分析

**响应特征**:
- HTTP 状态码: `200 OK`
- Content-Type: `text/html; charset=utf-8`
- 响应内容: SunPanel 主页的 HTML

**可能原因**:
1. **API 端点不存在** - 该版本的 SunPanel 可能不支持 API 删除
2. **路由问题** - 删除端点被重定向到主页
3. **功能被禁用** - API 删除功能可能被管理员禁用
4. **权限不足** - 需要特殊权限或不同的认证方式

### 对比 demo 实现

**demo 目录**: `/vol1/1000/code/demo/sunpanel_api/`

**文档声称**:
- ✅ 查询操作可用（已验证）
- ✅ 删除操作可用（**我们无法复现**）
- 需要浏览器 Cookie

**差异**:
- Demo 可能使用不同版本的 SunPanel
- Demo 可能有特殊配置
- Demo 的测试可能未实际执行删除

---

## 📁 创建的文件

### 核心脚本

1. **`scripts/fully-automated-token.mjs`**
   - 完全自动化的 Token 获取
   - 推荐用于定期更新 Token

2. **`scripts/update-sunpanel-token.mjs`**
   - 交互式 Token 更新工具
   - 用于手动输入 Token

3. **`scripts/delete-sunpanel-cards-final.mjs`**
   - 尝试删除所有卡片（目前失败）
   - 保留用于未来版本测试

4. **`scripts/test-list-all-items.mjs`**
   - 测试获取卡片列表功能
   - 验证 API 连接正常

### 文档

1. **`docs/QUICK_GET_TOKEN.md`**
   - 3 种手动获取 Token 的方法
   - 浏览器书签、控制台、监听登录

2. **`docs/SUNPANEL_CLEANUP_GUIDE.md`**
   - SunPanel 卡片清理指南
   - 手动删除步骤
   - 浏览器控制台批量删除脚本
   - 问题排查

---

## 🔧 推荐的解决方案

### 短期方案（立即可用）

**方案 A: 手动 UI 删除**
1. 访问 http://192.168.9.2:20001
2. 在每个卡片上点击"..."→ 删除
3. 优点: 100% 可靠
4. 缺点: 手动操作

**方案 B: 浏览器控制台批量删除**
1. 打开 http://192.168.9.2:20001
2. F12 → Console
3. 粘贴 `docs/SUNPANEL_CLEANUP_GUIDE.md` 中的脚本
4. 优点: 批量操作
5. 缺点: 如果 API 不可用，仍需手动删除

**方案 C: 软删除（仅清理本地状态）**
```bash
# 修改 purgeSunPanel 函数，添加 softDelete 选项
curl -X POST http://192.168.9.200:51000/api/services/purge-remote \
  -d '{"softDelete": true}'
```
- 只清理本地 `syncStatus`
- 不尝试删除远端
- 下次同步会重新创建

### 长期方案

1. **升级 SunPanel**
   - 检查是否有新版本支持 API 删除
   - 查看 SunPanel 官方文档

2. **联系开发者**
   - 确认 API 删除的正确用法
   - 报告 API 端点问题

3. **替代方案**
   - 使用 Selenium 自动化 UI 操作
   - 直接操作 SunPanel 数据库（不推荐）

---

## 📊 功能状态总结

| 功能 | 状态 | 备注 |
|------|------|------|
| Token 自动获取 | ✅ 完成 | `fully-automated-token.mjs` |
| Token 自动更新 .env | ✅ 完成 | 自动写入 |
| 获取卡片列表 | ✅ 可用 | `listAllItems()` |
| 创建卡片 | ❓ 未测试 | 应该可用 |
| 更新卡片 | ❓ 未测试 | 应该可用 |
| 删除卡片 | ❌ 不可用 | API 返回 HTML |
| 清空远端数据库 | ⚠️ 部分可用 | Lucky 可用，SunPanel 不可用 |

---

## 🎓 关键经验

1. **Token 存储位置**: `localStorage.AUTH_TOKEN.data.token`
2. **登录页面路径**: `/login`（不是 `/`）
3. **清除缓存的重要性**: 必须清除才能看到登录表单
4. **API 一致性问题**: 不是所有 API 端点都可用
5. **文档与现实的差距**: Demo 文档可能与实际部署不符

---

## ✅ 下一步行动

### 立即可做

1. **使用自动 Token 获取**
   ```bash
   node scripts/fully-automated-token.mjs
   pm2 restart auto-ddnns
   ```

2. **手动清理 SunPanel 卡片**
   - 按照 `docs/SUNPANEL_CLEANUP_GUIDE.md` 操作

3. **文档化现状**
   - ✅ 已创建清理指南
   - ✅ 已记录 API 限制

### 未来改进

1. **定期自动更新 Token**
   ```bash
   # 添加到 crontab
   0 */12 * * * cd /vol1/1000/code/auto-ddnns && node scripts/fully-automated-token.mjs && pm2 restart auto-ddnns
   ```

2. **监控 SunPanel 版本更新**
   - 检查是否修复了删除 API

3. **实现软删除功能**
   - 修改 `purgeSunPanel` 添加 `softDelete` 选项
   - 只清理本地状态

---

## 📞 支持

如有问题：
1. 查看 `docs/SUNPANEL_CLEANUP_GUIDE.md`
2. 运行 `node scripts/test-list-all-items.mjs` 验证连接
3. 检查 `.env` 文件中的 `SUNPANEL_API_TOKEN`

---

**报告版本**: 1.0  
**最后更新**: 2026-06-06  
**测试环境**: SunPanel @ http://192.168.9.2:20001
