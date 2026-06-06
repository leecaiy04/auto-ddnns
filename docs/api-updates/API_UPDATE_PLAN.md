# API 更新计划

**日期**: 2026-06-06  
**目标**: 根据 `/vol1/1000/code/demo` 中的最新 Lucky 和 SunPanel API 实现，完善本项目

---

## 📊 当前状态分析

### Lucky API

**当前实现**:
- ✅ 基础认证（OpenToken）
- ✅ 反向代理 API
- ✅ SSL 证书管理（基础）
- ✅ DDNS 管理
- ✅ 端口管理
- ⚠️ 缺少部分端点

**Demo 中的新功能**:
- ✅ 完整的 SSL 证书管理（续期、删除、设置）
- ✅ 端口转发 API
- ✅ WOL 网络唤醒
- ✅ FTP 服务器管理
- ✅ WebDAV 管理
- ✅ 系统信息 API
- ✅ 更规范的 API 封装

### SunPanel API

**当前实现**:
- ✅ OpenAPI v1 认证（使用 Token Header）
- ✅ 分组 CRUD
- ✅ 卡片 CRUD
- ⚠️ 认证方式可能需要调整

**Demo 中的改进**:
- ✅ 支持内部 API（POST 方式）
- ✅ 改进的认证处理
- ✅ 更完整的 CRUD 操作
- ✅ 便捷方法（查找、列表等）

---

## 🎯 更新任务

### 1. Lucky API 更新

#### 1.1 添加缺失的 API 端点

**lucky-api.mjs**:
- ✅ 保持当前的 OpenToken 认证
- ✅ 改进错误处理
- ✅ 添加便捷方法

**新增模块** `lucky-system.mjs`:
```javascript
- getVersion()          // 获取版本信息
- getSystemInfo()       // 获取系统信息
- getModuleList()       // 获取模块列表
```

**新增模块** `lucky-portforward.mjs`:
```javascript
- getPortForwardRules() // 获取端口转发规则
- addPortForward()      // 添加端口转发
- updatePortForward()   // 更新端口转发
- deletePortForward()   // 删除端口转发
```

**新增模块** `lucky-wol.mjs`:
```javascript
- getWolDevices()       // 获取 WOL 设备列表
- wakeDevice()          // 唤醒设备
- addWolDevice()        // 添加 WOL 设备
- deleteWolDevice()     // 删除 WOL 设备
```

**增强模块** `lucky-ssl.mjs`:
```javascript
- getSSLList()          // ✅ 已有
- applyACMECert()       // ✅ 已有
+ renewAllCerts()       // 手动续期所有证书
+ getSSLSetting()       // 获取 SSL 设置
+ updateSSLSetting()    // 更新 SSL 设置
+ deleteCert()          // 删除证书
```

#### 1.2 改进现有实现

**lucky-reverseproxy.mjs**:
- ✅ 保持当前实现
- ➕ 添加便捷方法：
  - `findRuleByDomain(domain)`
  - `listAllDomains()`

**lucky-ddns.mjs**:
- ✅ 保持当前实现
- ➕ 添加便捷方法：
  - `findDDNSByDomain(domain)`
  - `triggerManualUpdate()`

### 2. SunPanel API 更新

#### 2.1 改进认证方式

**sunpanel-api.mjs**:
- ✅ 保持当前的 Token 认证（Header 方式）
- ➕ 添加内部 API 支持（作为备选）
- ✅ 改进错误处理

#### 2.2 增强便捷方法

**sunpanel-api.mjs** 新增方法:
```javascript
+ getAllGroupsWithItems()    // 获取所有分组和项目
+ findItemByTitle(title)     // 根据标题查找项目
+ findGroupByTitle(title)    // 根据标题查找分组
+ listAllItems()             // 列出所有项目（扁平化）
+ getSiteSettings()          // 获取站点设置
+ getUserInfo()              // 获取用户信息
```

### 3. 管理器层更新

#### 3.1 LuckyManager

**modules/lucky-manager/index.mjs**:
- ✅ 保持当前编排逻辑
- ➕ 添加便捷方法访问新 API
- ➕ 改进错误处理和重试逻辑

#### 3.2 SunPanelManager

**modules/sunpanel-manager/index.mjs**:
- ✅ 保持当前同步逻辑
- ➕ 使用新的便捷方法
- ➕ 改进错误处理

---

## 📝 实施步骤

### Phase 1: Lucky API 扩展 ✅

1. ✅ 创建 `lucky-system.mjs`
2. ✅ 创建 `lucky-portforward.mjs`
3. ✅ 创建 `lucky-wol.mjs`
4. ✅ 增强 `lucky-ssl.mjs`
5. ✅ 为 `lucky-reverseproxy.mjs` 添加便捷方法

### Phase 2: SunPanel API 增强 ✅

1. ✅ 为 `sunpanel-api.mjs` 添加便捷方法
2. ✅ 改进错误处理
3. ✅ 添加内部 API 支持（备选）

### Phase 3: 管理器更新 ✅

1. ✅ 更新 LuckyManager 使用新 API
2. ✅ 更新 SunPanelManager 使用新方法

### Phase 4: 测试和文档 ✅

1. ✅ 运行测试套件
2. ✅ 更新 CLAUDE.md
3. ✅ 更新 README.md（如需要）

---

## ⚠️ 注意事项

1. **向后兼容**: 所有更新必须保持向后兼容，不破坏现有功能
2. **错误处理**: 新 API 应有完善的错误处理和重试机制
3. **配置优先级**: 环境变量 > hub.json > 默认值
4. **日志记录**: 关键操作应有日志记录
5. **测试覆盖**: 新功能应有对应的测试用例

---

## 📚 参考资料

- Demo Lucky API: `/vol1/1000/code/demo/lucky_api/lucky_automated_api.py`
- Demo SunPanel API: `/vol1/1000/code/demo/sunpanel_api/automated_api.py`
- Lucky API 文档: `/vol1/1000/code/demo/lucky_api/lucky_api_documentation.md`
- SunPanel API 文档: `/vol1/1000/code/demo/sunpanel_api/sunpanel_api_documentation.md`
