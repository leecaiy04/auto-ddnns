# 临时脚本分析与整理方案

**分析日期**: 2026-06-06

## 脚本分类

### 类别 1: Token 管理脚本（需整合）- 9 个

| 脚本 | 大小 | 功能 | 处理方案 |
|------|------|------|----------|
| `auto-get-token.mjs` | 6.6K | 自动获取 Token（基础版） | 🔄 整合到 token-manager |
| `auto-get-token-cookies.mjs` | 4.2K | 通过 Cookie 获取 Token | 🔄 整合到 token-manager |
| `get-token-via-chrome.mjs` | 16K | Chrome CDP 获取 Token（v1） | 🔄 整合到 token-manager |
| `get-token-via-chrome-v2.mjs` | 11K | Chrome CDP 获取 Token（v2） | 🔄 整合到 token-manager |
| `fully-automated-token.mjs` | 14K | 全自动 Token 获取 | 🔄 整合到 token-manager |
| `capture-current-token.mjs` | 7.0K | 捕获当前 Token | 🔄 整合到 token-manager |
| `auto-relogin.mjs` | 9.8K | 自动重新登录 | 🔄 整合到 token-manager |
| `get-sunpanel-token.mjs` | 4.5K | 获取 SunPanel Token | 🔄 整合到 token-manager |
| `update-sunpanel-token.mjs` | 3.0K | 更新 SunPanel Token | 🔄 整合到 token-manager |

**问题**: 9 个脚本做类似的事情（Token 获取和管理），版本混乱  
**方案**: 整合为 `shared/token-manager.mjs` 模块，提供统一的 Token 管理接口

### 类别 2: SunPanel 批量操作脚本（需整合）- 4 个

| 脚本 | 大小 | 功能 | 处理方案 |
|------|------|------|----------|
| `delete-all-sunpanel-cards.mjs` | 4.9K | 删除所有卡片（v1） | 🔄 整合到 SunPanelManager |
| `delete-sunpanel-cards-final.mjs` | 8.7K | 删除所有卡片（最终版） | 🔄 整合到 SunPanelManager |
| `delete-sunpanel-cards-with-cookie.mjs` | 8.5K | 通过 Cookie 删除卡片 | 🔄 整合到 SunPanelManager |
| `test-purge-sunpanel.mjs` | 2.1K | 测试清空 SunPanel | 🔄 整合到 SunPanelManager |

**问题**: 多个版本的删除脚本，应该是功能开发过程中的迭代  
**方案**: 在 `SunPanelManager` 中添加 `purgeAllCards()` 方法，作为管理功能

### 类别 3: 测试脚本（保留）- 2 个

| 脚本 | 大小 | 功能 | 处理方案 |
|------|------|------|----------|
| `test-list-all-items.mjs` | 1.3K | 测试列出所有项目 | ✅ 移动到 test/ 目录 |
| `sync-lucky-to-sunpanel.mjs` | 18K | 手动同步测试 | ✅ 移动到 scripts/tools/ |

**方案**: 
- `test-list-all-items.mjs` → `test/manual/sunpanel-list-items.mjs`
- `sync-lucky-to-sunpanel.mjs` → `scripts/tools/manual-sync.mjs`（保留作为手动工具）

### 类别 4: IPv6 查询脚本（保留/简化）- 6 个

| 脚本 | 大小 | 功能 | 处理方案 |
|------|------|------|----------|
| `query-device-ipv6.mjs` | 5.2K | 通过 SSH 查询设备 IPv6 | ✅ 移动到 scripts/tools/ |
| `query-ikuai-ipv6.mjs` | 6.0K | 查询 iKuai 路由器 IPv6 | ✅ 移动到 scripts/tools/ |
| `get-global-ipv6.mjs` | 5.2K | 获取全局 IPv6 地址 | 🔄 整合到 DeviceMonitor |
| `check-network-ipv6.mjs` | 3.9K | 检查网络 IPv6 连接性 | 🔄 整合到 DeviceMonitor |
| `show-ipv6.mjs` | 3.0K | 显示 IPv6 信息 | ✅ 移动到 scripts/tools/ |
| `simple-ipv6-query.mjs` | 3.3K | 简单 IPv6 查询 | ❌ 删除（功能重复） |

**方案**: 
- 保留 3 个独立工具脚本
- 2 个整合到 `DeviceMonitor` 模块
- 1 个删除（功能重复）

### 类别 5: 初始化脚本（保留）- 1 个

| 脚本 | 大小 | 功能 | 处理方案 |
|------|------|------|----------|
| `init-setup.mjs` | 2.9K | 首次安装向导 | ✅ 保留在 scripts/ |

**方案**: 保留，已经是正式的初始化脚本

### 类别 6: Shell 脚本 - 1 个

| 脚本 | 大小 | 功能 | 处理方案 |
|------|------|------|----------|
| `delete-all-sunpanel-cards.sh` | ? | Shell 版本删除脚本 | ❌ 删除 |

---

## 整理方案汇总

### 新建目录结构

```
scripts/
├── init-setup.mjs                    # 保留：初始化脚本
├── tools/                            # 新建：独立工具脚本
│   ├── query-device-ipv6.mjs         # IPv6 查询工具
│   ├── query-ikuai-ipv6.mjs          # iKuai 路由器查询
│   ├── show-ipv6.mjs                 # IPv6 信息显示
│   └── manual-sync.mjs               # 手动同步工具（原 sync-lucky-to-sunpanel.mjs）
└── archive/                          # 新建：存档（待删除）
    ├── token-获取脚本-9个.mjs
    ├── sunpanel-删除脚本-4个.mjs
    └── 其他待删除脚本

test/
└── manual/                           # 新建：手动测试脚本
    └── sunpanel-list-items.mjs

shared/
└── token-manager.mjs                 # 新建：统一 Token 管理模块
```

### 实施步骤

#### Step 1: 创建新模块（整合功能）

1. **创建 `shared/token-manager.mjs`**
   - 合并 9 个 Token 脚本的核心逻辑
   - 提供统一的 API:
     ```javascript
     class TokenManager {
       async getToken(service)          // 自动获取 Token
       async refreshToken(service)      // 刷新 Token
       async login(service)             // 重新登录
       isTokenValid(token)              // 验证 Token
     }
     ```

2. **增强 `SunPanelManager`**
   - 添加 `purgeAllCards()` 方法
   - 添加 `deleteCardsByPattern()` 方法

3. **增强 `DeviceMonitor`**
   - 整合 `get-global-ipv6.mjs` 逻辑
   - 整合 `check-network-ipv6.mjs` 逻辑

#### Step 2: 创建目录并移动文件

```bash
# 创建新目录
mkdir -p scripts/tools scripts/archive test/manual

# 移动保留的工具脚本
mv scripts/query-device-ipv6.mjs scripts/tools/
mv scripts/query-ikuai-ipv6.mjs scripts/tools/
mv scripts/show-ipv6.mjs scripts/tools/
mv scripts/sync-lucky-to-sunpanel.mjs scripts/tools/manual-sync.mjs

# 移动测试脚本
mv scripts/test-list-all-items.mjs test/manual/sunpanel-list-items.mjs

# 移动到存档（准备删除）
mv scripts/auto-get-token*.mjs scripts/archive/
mv scripts/get-token*.mjs scripts/archive/
mv scripts/capture-current-token.mjs scripts/archive/
mv scripts/auto-relogin.mjs scripts/archive/
mv scripts/fully-automated-token.mjs scripts/archive/
mv scripts/update-sunpanel-token.mjs scripts/archive/
mv scripts/delete-*-sunpanel*.mjs scripts/archive/
mv scripts/test-purge-sunpanel.mjs scripts/archive/
mv scripts/simple-ipv6-query.mjs scripts/archive/
mv scripts/delete-all-sunpanel-cards.sh scripts/archive/
```

#### Step 3: 删除存档文件

```bash
# 验证新功能正常后删除
rm -rf scripts/archive/
```

---

## 预期成果

| 指标 | 当前 | 目标 | 改善 |
|------|------|------|------|
| scripts/ 目录脚本数 | 22 个 | 5 个 | -77% |
| Token 管理脚本 | 9 个版本 | 1 个模块 | 统一管理 |
| SunPanel 删除脚本 | 4 个版本 | 管理器方法 | 标准化 |
| 功能整合度 | 低（散落在脚本中） | 高（模块化） | 易维护 |

---

## 风险与注意事项

1. **Token 管理脚本**
   - ⚠️ 这些脚本可能包含不同的认证策略
   - 🔒 需要仔细测试，确保新模块支持所有场景
   - 💾 短期内保留 archive/ 作为备份

2. **SunPanel 批量操作**
   - ⚠️ 删除操作有风险，需要二次确认机制
   - 🔒 新方法应该有 `--dry-run` 选项

3. **IPv6 查询脚本**
   - ℹ️ 这些是独立工具，可以保留在 tools/ 下
   - 📝 添加使用文档

---

## 下一步

1. ✅ 完成本分析文档
2. ⏭️ 创建 `shared/token-manager.mjs`
3. ⏭️ 增强 `SunPanelManager` 和 `DeviceMonitor`
4. ⏭️ 执行文件移动和目录重组
5. ⏭️ 测试新功能
6. ⏭️ 删除存档文件
7. ⏭️ 更新文档
