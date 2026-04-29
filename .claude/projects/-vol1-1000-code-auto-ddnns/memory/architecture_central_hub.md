---
name: architecture_central_hub
description: Central Hub 编排架构原则——模块独立，Hub 层统一调度
type: project
---

Central Hub 是唯一的编排中枢，各功能模块彼此不调用。

**规则**: 所有模块间协调必须通过 Central Hub 层（`central-hub/coordinator.mjs` 和路由处理器）完成，模块不能互相 import 或直接调用。

**Why**: 保持模块独立，每个 `modules/` 下的目录可单独导入使用，降低耦合度。数据流单向传递，便于调试和维护。

**How to apply**:
- 新增功能时放在 `modules/` 下作为独立模块
- 模块间需要的交互通过 Coordinator 或路由处理器传递参数
- 模块导出方法，由 Hub 层按需调用并串联数据流
- 当前调度链: DeviceMonitor → LuckyManager → SunPanelManager → CloudflareManager
