# Scripts 目录说明

## 目录结构

```
scripts/
├── init-setup.mjs          # 首次安装向导
├── tools/                  # 独立工具脚本
│   ├── manual-sync.mjs     # 手动 Lucky → SunPanel 同步工具
│   ├── query-device-ipv6.mjs   # SSH 查询设备 IPv6
│   ├── query-ikuai-ipv6.mjs    # 查询 iKuai 路由器 IPv6
│   └── show-ipv6.mjs           # 显示 IPv6 信息
└── archive/                # 已整合到模块的旧脚本（待删除）
```

## 工具脚本使用

### 初始化向导
```bash
node scripts/init-setup.mjs
```

### IPv6 查询工具

**查询设备 IPv6（通过 SSH）**:
```bash
node scripts/tools/query-device-ipv6.mjs
```

**查询 iKuai 路由器**:
```bash
node scripts/tools/query-ikuai-ipv6.mjs
```

**显示本机 IPv6 信息**:
```bash
node scripts/tools/show-ipv6.mjs
```

### 手动同步工具

```bash
node scripts/tools/manual-sync.mjs
```

## Archive 目录

Archive 目录包含已整合到模块的旧脚本：

- **Token 管理脚本** (9个) → 已整合到 `shared/token-manager.mjs`
- **SunPanel 批量删除脚本** (4个) → 已整合到 `SunPanelManager.purgeAllCards()`
- **其他重复脚本** → 已整合到对应模块

这些脚本将在验证新功能正常后删除。

## 从脚本迁移到模块

如果你之前使用脚本完成某些操作，现在可以通过以下方式调用：

### Token 管理
```javascript
import { TokenManager } from './shared/token-manager.mjs';
const tokenManager = new TokenManager();
await tokenManager.getToken('sunpanel');
```

### SunPanel 批量操作
```javascript
import { SunPanelManager } from './modules/sunpanel-manager/index.mjs';
const sunpanelManager = new SunPanelManager(config, stateManager);
await sunpanelManager.purgeAllCards({ dryRun: true });
```
