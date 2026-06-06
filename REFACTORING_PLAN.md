# Auto-DDNNS 重构计划

**版本**: v2.0.0 → v2.1.0  
**日期**: 2026-06-06  
**状态**: 📝 规划中

---

## 📊 项目现状评估

### 项目规模

- **代码文件数**: ~700 个 `.mjs` 文件
- **当前版本**: v2.0.0
- **测试覆盖**: 110 个测试，通过率 93.6% (103/110)
- **技术栈**: Node.js 18+, Express, 纯 ESM, 无构建步骤
- **部署方式**: PM2 (FNOS NAS)

### 架构优势 ✅

1. **清晰的模块化设计**
   - 独立的功能模块 (`modules/`)
   - 共享基础设施 (`shared/`)
   - 统一的编排层 (`central-hub/`)
   - 职责分离明确

2. **良好的可扩展性**
   - 多实例支持（Lucky/SunPanel 主备节点）
   - 配置驱动设计
   - 模块间松耦合

3. **完整的 API 覆盖**
   - Lucky API 功能齐全（反向代理、DDNS、SSL、端口转发、WOL）
   - SunPanel 内外 API 双支持
   - Cloudflare DNS 管理

4. **实用的工具链**
   - Web 监控仪表盘
   - Claude Code Skill 集成
   - 变更审计日志

### 存在的问题 ⚠️

#### 1. 代码质量问题

**配置管理复杂**
```javascript
// server.mjs:65-115 - 50 行的配置覆盖函数
function applyRuntimeConfigOverrides(config) {
  // 大量环境变量处理逻辑
  // Lucky 实例配置组装
  // SunPanel 实例配置组装
  // 缺乏统一的配置模式
}
```

**模块别名混乱**
```javascript
// server.mjs:223-225
this.modules.lucky = this.modules.luckyManager;
this.modules.ddns = this.modules.luckyManager;
// 同一实例多个别名，增加维护难度
```

**硬编码值分散**
```javascript
// server.mjs:23
const DEFAULT_DOMAIN = 'leecaiy.shop';
const LOCAL_HOSTS_FOR_PROBE = ['127.0.0.1', 'localhost'];
// 应集中到配置文件
```

#### 2. 技术债务

**临时脚本泛滥**
```
scripts/
├── auto-get-token.mjs              # Token 获取脚本 (多个版本)
├── auto-get-token-cookies.mjs
├── get-token-via-chrome.mjs
├── get-token-via-chrome-v2.mjs
├── fully-automated-token.mjs
├── capture-current-token.mjs
├── update-sunpanel-token.mjs
├── delete-all-sunpanel-cards.mjs   # 删除卡片脚本 (多个版本)
├── delete-sunpanel-cards-final.mjs
├── delete-sunpanel-cards-with-cookie.mjs
├── test-purge-sunpanel.mjs
└── ...
```

**问题分析**:
- 20+ 临时脚本未整合到主系统
- 多个相似功能的脚本版本（token 获取有 7 个版本）
- 说明某些功能未自动化或 API 不稳定
- 应整合为模块化功能或命令行工具

**测试失败未修复**
```
失败测试 (7/110):
1. smartAddOrUpdateSubRule - Lucky 规则缺失测试
2. GET /api/services/connectivity - 连接性探测测试
3-7. SunPanel 同步相关测试 (5 个)
```

**文档碎片化**
```
根目录:
├── CLAUDE.md               # 项目文档
├── README.md
├── API_UPDATE_PLAN.md      # 临时文档
├── API_UPDATE_SUMMARY.md   # 临时文档
└── docs/                   # 新增的文档目录
```

#### 3. 架构设计问题

**状态管理分散**
- `hub-state.json` - 系统状态
- `services-registry.json` - 服务清单
- `changelog.json` - 变更日志
- 缺乏统一的状态同步机制
- 无状态版本控制

**错误处理不一致**
- 部分模块有重试机制
- 部分模块直接抛出错误
- 缺乏统一的错误分类和处理策略

**日志系统简陋**
```javascript
// 到处都是 console.log
console.log('[Coordinator] 🚀 启动总协调器...');
console.error('[Coordinator] ❌ 初始 DDNS 调和失败:', error.message);
// 缺乏日志级别、轮转、结构化日志
```

**并发控制缺失**
- Coordinator 中多个定时任务可能同时执行
- 无任务队列和锁机制
- 可能导致状态冲突

#### 4. 性能优化空间

**无缓存机制**
- Lucky/SunPanel API 调用无缓存
- 频繁的 HTTP 请求
- 应添加智能缓存层

**同步策略原始**
- 全量同步，无增量更新
- 未利用变更检测优化
- SunPanel 同步超时问题（见 git log）

**启动时间长**
- 所有模块串行初始化
- 应优化为并行初始化

#### 5. 安全性问题

**敏感信息处理**
```javascript
// 配置查看端点 - 是否充分脱敏？
this.app.use('/api/config', configRoutes(this.modules));
```

**Token 管理复杂**
- 多个 token 获取脚本说明认证流程不稳定
- 应建立统一的 Token 刷新机制

**无 API 访问控制**
- Central Hub API 无认证
- 仅依赖内网隔离
- 应考虑基础认证

---

## 🎯 重构目标

### 核心目标

1. **提升代码质量**: 统一编码规范，减少技术债务
2. **增强可维护性**: 模块化重构，清晰的依赖关系
3. **优化性能**: 缓存、并发控制、增量同步
4. **完善测试**: 修复失败测试，提高覆盖率到 95%+
5. **改进可观测性**: 结构化日志、监控指标、告警

### 非目标

- ❌ 重写整个系统
- ❌ 更换技术栈
- ❌ 引入数据库（保持 JSON 存储）
- ❌ 大规模 API 变更（保持向后兼容）

---

## 📋 重构任务清单

### Phase 1: 清理与整合 (优先级: 🔥 高)

#### 1.1 临时脚本整理
- [ ] 分析 20+ 临时脚本的用途和依赖
- [ ] 将通用功能整合到模块
  - [ ] Token 管理整合到 `shared/token-manager.mjs`
  - [ ] 批量清理功能整合到管理器
- [ ] 保留必要的独立脚本，移动到 `scripts/tools/`
- [ ] 删除废弃和重复的脚本
- [ ] 为保留脚本编写使用文档

**预期成果**: 脚本数量减少到 5-8 个，功能明确

#### 1.2 配置系统重构
- [ ] 创建 `shared/config-manager.mjs` 统一配置管理
- [ ] 定义配置 Schema（支持验证）
- [ ] 抽取硬编码值到配置文件
- [ ] 简化 `applyRuntimeConfigOverrides` 逻辑
- [ ] 支持配置热更新（无需重启）

**预期成果**: 配置逻辑集中到单一模块，代码减少 100+ 行

#### 1.3 模块别名清理
- [ ] 移除 `this.modules.lucky` 和 `this.modules.ddns` 别名
- [ ] 统一使用 `this.modules.luckyManager`
- [ ] 更新所有路由引用
- [ ] 更新文档

**预期成果**: 模块引用统一，消除歧义

#### 1.4 文档整合
- [ ] 合并 `API_UPDATE_*.md` 到 `docs/api-updates/`
- [ ] 创建 `docs/architecture.md` 架构文档
- [ ] 创建 `docs/development.md` 开发指南
- [ ] 更新 CLAUDE.md 和 README.md
- [ ] 删除过期文档

### Phase 2: 架构改进 (优先级: 🔥 高)

#### 2.1 统一错误处理
- [ ] 创建 `shared/error-handler.mjs`
- [ ] 定义错误类型和分级
  ```javascript
  class NetworkError extends BaseError {}
  class AuthenticationError extends BaseError {}
  class ConfigurationError extends BaseError {}
  ```
- [ ] 实现统一的重试策略
- [ ] 为 Express 添加全局错误中间件

#### 2.2 结构化日志系统
- [ ] 引入 `pino` 或 `winston` 日志库
- [ ] 定义日志级别（debug/info/warn/error）
- [ ] 支持日志轮转
- [ ] 添加请求追踪 ID
- [ ] 集成到所有模块

**配置示例**:
```javascript
{
  "logging": {
    "level": "info",
    "file": "./logs/central-hub.log",
    "maxSize": "10m",
    "maxFiles": 5
  }
}
```

#### 2.3 并发控制
- [ ] 创建 `shared/task-queue.mjs` 任务队列
- [ ] 实现分布式锁（基于文件或状态管理器）
- [ ] 为 Coordinator 任务添加互斥控制
- [ ] 防止同一任务重复执行

#### 2.4 状态管理增强
- [ ] 为状态文件添加版本号
- [ ] 实现状态迁移机制
- [ ] 添加状态快照和回滚功能
- [ ] 状态变更事件通知

### Phase 3: 性能优化 (优先级: 🔶 中)

#### 3.1 缓存层
- [ ] 创建 `shared/cache-manager.mjs`
- [ ] 为 Lucky API 添加缓存（TTL: 30s）
- [ ] 为 SunPanel API 添加缓存（TTL: 60s）
- [ ] 支持缓存失效策略
- [ ] 添加缓存命中率监控

#### 3.2 增量同步
- [ ] SunPanel 同步改为增量模式
  - 比较本地状态和远程状态
  - 仅同步变更的服务
  - 添加强制全量同步选项
- [ ] Lucky 同步优化
  - 检测代理规则变更
  - 避免重复创建
- [ ] Cloudflare DNS 增量更新

#### 3.3 并行初始化
- [ ] 分析模块依赖关系
- [ ] 实现模块并行初始化
- [ ] 减少启动时间（目标 < 5s）

#### 3.4 连接池
- [ ] 为 SSH 连接添加连接池
- [ ] 为 HTTP 客户端使用 `http.Agent`
- [ ] 优化并发请求性能

### Phase 4: 功能增强 (优先级: 🔶 中)

#### 4.1 Token 管理自动化
- [ ] 创建 `shared/token-manager.mjs`
- [ ] 实现 Token 自动刷新
- [ ] 支持多种认证方式（OpenToken, Cookie, JWT）
- [ ] Token 过期监控和告警
- [ ] 整合现有的 token 脚本逻辑

#### 4.2 健康检查增强
- [ ] 深度健康检查（检查各模块状态）
- [ ] 依赖服务健康检查（Lucky, SunPanel, Router）
- [ ] 就绪探针和存活探针
- [ ] 健康检查历史记录

#### 4.3 监控指标
- [ ] 创建 `central-hub/routes/metrics.mjs`
- [ ] 导出 Prometheus 格式指标
  - API 请求计数
  - 同步任务执行时间
  - 错误率
  - 缓存命中率
- [ ] 集成到仪表盘

#### 4.4 告警系统
- [ ] SSL 证书过期告警（利用新 API）
- [ ] DDNS 更新失败告警
- [ ] 设备离线告警
- [ ] 同步失败告警
- [ ] 支持多种通知渠道（邮件、Webhook）

### Phase 5: 测试与质量 (优先级: 🔶 中)

#### 5.1 修复失败测试
- [ ] 修复 `smartAddOrUpdateSubRule` 测试
- [ ] 修复连接性探测测试
- [ ] 修复 5 个 SunPanel 同步测试
- [ ] 分析根本原因，添加回归测试

#### 5.2 测试覆盖提升
- [ ] 为新增 API 编写单元测试
- [ ] 添加集成测试
- [ ] 添加端到端测试（E2E）
- [ ] 目标覆盖率：95%+

#### 5.3 性能测试
- [ ] 并发请求测试
- [ ] 长时间运行稳定性测试
- [ ] 内存泄漏检测
- [ ] 同步性能基准测试

#### 5.4 代码质量工具
- [ ] 添加 ESLint 配置
- [ ] 添加 Prettier 配置
- [ ] 设置 pre-commit hooks
- [ ] CI/CD 集成代码检查

### Phase 6: 安全加固 (优先级: 🔷 低)

#### 6.1 API 访问控制
- [ ] 为 Central Hub 添加可选的 API Key 认证
- [ ] 实现基于角色的访问控制（RBAC）
- [ ] 敏感端点访问审计
- [ ] 请求频率限制（Rate Limiting）

#### 6.2 配置脱敏
- [ ] 审查所有 API 响应
- [ ] 确保敏感信息不泄露
- [ ] 配置查看端点强制脱敏
- [ ] 添加脱敏配置选项

#### 6.3 安全审计
- [ ] 依赖漏洞扫描（npm audit）
- [ ] 输入验证加强
- [ ] SQL/命令注入防护审查
- [ ] 安全配置最佳实践

---

## 🗓️ 实施计划

### 时间线

```
Week 1-2: Phase 1 (清理与整合)
├─ Day 1-3: 临时脚本整理
├─ Day 4-6: 配置系统重构
├─ Day 7-10: 模块别名清理 + 文档整合
└─ Day 11-14: 代码审查和测试

Week 3-4: Phase 2 (架构改进)
├─ Day 15-17: 统一错误处理
├─ Day 18-20: 结构化日志系统
├─ Day 21-23: 并发控制
└─ Day 24-28: 状态管理增强

Week 5-6: Phase 3 (性能优化)
├─ Day 29-32: 缓存层实现
├─ Day 33-36: 增量同步
├─ Day 37-38: 并行初始化
└─ Day 39-42: 性能测试和优化

Week 7-8: Phase 4 (功能增强)
├─ Day 43-46: Token 管理自动化
├─ Day 47-49: 健康检查增强
├─ Day 50-52: 监控指标
└─ Day 53-56: 告警系统

Week 9-10: Phase 5 (测试与质量)
├─ Day 57-60: 修复失败测试
├─ Day 61-65: 测试覆盖提升
├─ Day 66-68: 性能测试
└─ Day 69-70: 代码质量工具

Week 11-12: Phase 6 (安全加固) + 收尾
├─ Day 71-74: API 访问控制
├─ Day 75-77: 配置脱敏
├─ Day 78-80: 安全审计
└─ Day 81-84: 最终测试和发布准备
```

### 里程碑

- **M1 (Week 2)**: 技术债务清理完成，配置系统重构完成
- **M2 (Week 4)**: 架构改进完成，日志和错误处理统一
- **M3 (Week 6)**: 性能优化完成，缓存和增量同步上线
- **M4 (Week 8)**: 功能增强完成，监控告警系统就绪
- **M5 (Week 10)**: 测试覆盖达标，质量门槛通过
- **M6 (Week 12)**: v2.1.0 发布

---

## 📊 成功指标

### 量化目标

| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| 测试通过率 | 93.6% | 100% |
| 测试覆盖率 | ~70% | 95%+ |
| 临时脚本数量 | 20+ | 5-8 |
| 启动时间 | ~8s | <5s |
| 平均同步时间 | ~30s | <15s |
| 代码行数（LOC） | ~15000 | -10% (通过清理) |
| 配置逻辑集中度 | 分散 | 单一模块 |
| 文档完整性 | 60% | 90% |

### 质量目标

- ✅ 无 ESLint 错误
- ✅ 无 npm audit 高危漏洞
- ✅ 无已知的内存泄漏
- ✅ 所有 API 有错误处理
- ✅ 所有模块有单元测试
- ✅ 结构化日志覆盖率 100%

---

## 🔄 迁移策略

### 向后兼容性保证

1. **API 兼容性**
   - 所有现有 REST API 端点保持不变
   - 新增端点使用 `/api/v2/` 前缀
   - 弃用端点保留至少 1 个版本

2. **配置兼容性**
   - 支持旧配置格式（自动迁移）
   - 提供配置升级工具
   - 配置变更有详细的迁移指南

3. **状态文件兼容性**
   - 状态文件版本自动升级
   - 保留旧版本备份
   - 支持回滚到旧版本

### 灰度发布计划

```
Stage 1: 开发环境测试 (Week 1-10)
├─ 持续集成测试
├─ 单元测试、集成测试
└─ 性能基准测试

Stage 2: 预发布环境 (Week 11)
├─ 完整功能测试
├─ 长时间稳定性测试
└─ 性能压力测试

Stage 3: 生产环境 (Week 12)
├─ 数据备份
├─ 配置迁移
├─ 蓝绿部署
└─ 监控和回滚准备
```

---

## ⚠️ 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 配置重构破坏兼容性 | 高 | 中 | 完整的配置迁移测试，保留回退机制 |
| 并发控制引入死锁 | 高 | 低 | 锁超时机制，死锁检测 |
| 缓存策略不当导致数据不一致 | 中 | 中 | 保守的 TTL，强制刷新接口 |
| 日志系统影响性能 | 低 | 中 | 异步日志，日志级别控制 |
| Token 管理重构失败 | 中 | 低 | 保留现有脚本作为降级方案 |

### 项目风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 重构周期过长 | 中 | 中 | 分阶段交付，每个 Phase 可独立发布 |
| 测试覆盖不足 | 高 | 中 | 强制要求新代码有测试，代码审查 |
| 文档更新滞后 | 低 | 高 | 文档与代码同步更新，CI 检查 |
| 人力资源不足 | 高 | 低 | 优先级排序，核心功能优先 |

---

## 📚 参考资料

### 内部文档
- `CLAUDE.md` - 项目文档
- `API_UPDATE_SUMMARY.md` - 最近的 API 更新
- `docs/` - 技术文档

### 外部资源
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Express Production Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [Twelve-Factor App](https://12factor.net/)

---

## 📝 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-06-06 | 1.0 | 初始版本，完整重构计划 |

---

## 🤝 参与指南

### 如何贡献

1. **选择任务**: 从任务清单中选择未完成的任务
2. **创建分支**: `git checkout -b refactor/task-name`
3. **开发**: 遵循编码规范，编写测试
4. **测试**: 确保所有测试通过
5. **提交**: 遵循 Conventional Commits 规范
6. **PR**: 创建 Pull Request，等待审查

### 编码规范

```javascript
// 使用 async/await，避免回调
async function goodExample() {
  const result = await someAsyncOperation();
  return result;
}

// 统一错误处理
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', { error, context });
  throw new OperationError('Failed to ...', { cause: error });
}

// 配置获取优先级：参数 > 环境变量 > 配置文件 > 默认值
const value = options.value ?? process.env.VALUE ?? config.value ?? DEFAULT_VALUE;

// 模块导入顺序：Node 内置 > 第三方 > 本地
import path from 'path';
import express from 'express';
import { ConfigManager } from '../shared/config-manager.mjs';
```

### 提交信息规范

```
feat: 添加缓存管理器
fix: 修复 SunPanel 同步超时问题
refactor: 重构配置系统
test: 添加 LuckyManager 单元测试
docs: 更新架构文档
chore: 清理临时脚本
```

---

## 🎯 下一步行动

### 立即执行
1. ✅ 审查本重构计划
2. ⏭️ 确定优先级和资源分配
3. ⏭️ 创建 GitHub Project / Issue 跟踪进度
4. ⏭️ 开始 Phase 1: 清理与整合

### 关键决策点
- [ ] 是否引入日志库（pino vs winston）
- [ ] 是否添加 API 认证（必须 vs 可选）
- [ ] 缓存策略选择（内存 vs Redis）
- [ ] 测试框架选择（node:test vs Jest）

---

**备注**: 本文档是活动文档，会根据实施进展持续更新。每完成一个 Phase，更新对应的状态和时间线。
