# SunPanel Sync Skill

SunPanel 导航面板同步 Skill。

## 功能

- 从 Lucky 同步反向代理规则到 SunPanel
- 手动添加服务到 SunPanel（待实现）
- 批量同步服务

## 使用示例

```javascript
import SunPanelSync from './skills/sunpanel-sync/index.mjs';

// 同步所有 Lucky 反向代理规则
const result = await SunPanelSync.syncFromLucky();

// 同步指定端口
const result = await SunPanelSync.syncFromLucky({ port: 443 });

// 批量同步
const services = [
  { name: 'https', port: 443 },
  { name: 'http', port: 80 }
];
const results = await SunPanelSync.batchSync(services);
```
