# Auto-DDNS Skills

这个目录包含了所有可独立调用的功能模块（skills），每个 skill 都可以被 Hermes 或其他 AI 助手直接调用。

## Skill 架构设计

### 目录结构

```
skills/
├── README.md                    # 本文件
├── device-monitor/              # 设备监控 skill
│   ├── skill.mjs               # skill 入口
│   ├── README.md               # 使用文档
│   └── examples/               # 调用示例
├── lucky-manager/              # Lucky 管理 skill
│   ├── skill.mjs
│   ├── README.md
│   └── examples/
├── cloudflare-dns/             # Cloudflare DNS skill
│   ├── skill.mjs
│   ├── README.md
│   └── examples/
├── sunpanel-sync/              # SunPanel 同步 skill
│   ├── skill.mjs
│   ├── README.md
│   └── examples/
└── service-registry/           # 服务注册 skill
    ├── skill.mjs
    ├── README.md
    └── examples/
```

### Skill 接口规范

每个 skill 必须导出一个统一的接口：

```javascript
export default {
  // skill 元信息
  meta: {
    name: 'skill-name',
    version: '1.0.0',
    description: 'Skill 功能描述',
    author: 'Auto-DDNS',
  },
  
  // skill 提供的操作列表
  actions: {
    'action-name': {
      description: '操作描述',
      params: {
        param1: { type: 'string', required: true, description: '参数说明' },
        param2: { type: 'number', required: false, default: 0, description: '参数说明' },
      },
      returns: {
        type: 'object',
        description: '返回值说明',
      },
      handler: async (params) => {
        // 操作实现
        return result;
      },
    },
  },
  
  // 执行操作的统一入口
  async execute(action, params) {
    if (!this.actions[action]) {
      throw new Error(`Unknown action: ${action}`);
    }
    return await this.actions[action].handler(params);
  },
};
```

### 调用方式

#### 1. 命令行调用

```bash
# 通用调用格式
node skills/<skill-name>/skill.mjs <action> [params...]

# 示例：查询设备 IPv6
node skills/device-monitor/skill.mjs get-ipv6 --ip 192.168.9.10

# 示例：创建 Lucky 端口
node skills/lucky-manager/skill.mjs create-port --port 50010 --name "test-service"
```

#### 2. 程序调用

```javascript
import deviceMonitor from './skills/device-monitor/skill.mjs';

// 执行操作
const result = await deviceMonitor.execute('get-ipv6', {
  ip: '192.168.9.10'
});

console.log(result);
```

#### 3. HTTP API 调用

每个 skill 可以通过 Central Hub 的 API 网关调用：

```bash
# 通用格式
POST http://localhost:51000/api/skills/<skill-name>/<action>
Content-Type: application/json

{
  "params": {
    "param1": "value1",
    "param2": "value2"
  }
}

# 示例：查询设备 IPv6
curl -X POST http://localhost:51000/api/skills/device-monitor/get-ipv6 \
  -H "Content-Type: application/json" \
  -d '{"params": {"ip": "192.168.9.10"}}'
```

### 错误处理规范

所有 skill 必须遵循统一的错误处理格式：

```javascript
// 成功响应
{
  success: true,
  data: { /* 返回数据 */ },
  meta: {
    action: 'action-name',
    timestamp: '2026-04-30T15:30:00.000Z',
    duration: 123  // 执行时间（毫秒）
  }
}

// 错误响应
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: '错误描述',
    details: { /* 详细信息 */ }
  },
  meta: {
    action: 'action-name',
    timestamp: '2026-04-30T15:30:00.000Z'
  }
}
```

### 日志规范

每个 skill 应该使用统一的日志格式：

```javascript
import { createLogger } from '../utils/logger.mjs';

const logger = createLogger('skill-name');

logger.info('操作开始', { action, params });
logger.error('操作失败', { error, context });
logger.debug('调试信息', { data });
```

## 可用的 Skills

### 1. device-monitor

设备监控和网络发现功能。

**主要操作：**
- `list-devices` - 列出所有设备
- `get-ipv6` - 获取设备的 IPv6 地址
- `get-device-info` - 获取设备详细信息
- `scan-network` - 扫描网络中的设备

### 2. lucky-manager

Lucky 反向代理和 DDNS 管理。

**主要操作：**
- `list-ddns` - 列出 DDNS 任务
- `create-ddns` - 创建 DDNS 任务
- `delete-ddns` - 删除 DDNS 任务
- `list-ports` - 列出端口转发规则
- `create-port` - 创建端口转发
- `add-proxy` - 添加反向代理规则
- `list-ssl` - 列出 SSL 证书
- `apply-ssl` - 申请 SSL 证书

### 3. cloudflare-dns

Cloudflare DNS 记录管理。

**主要操作：**
- `list-records` - 列出 DNS 记录
- `create-record` - 创建 DNS 记录
- `update-record` - 更新 DNS 记录
- `delete-record` - 删除 DNS 记录
- `update-ddns` - 更新 DDNS（A/AAAA 记录）

### 4. sunpanel-sync

SunPanel 书签卡片同步。

**主要操作：**
- `sync-cards` - 同步所有卡片
- `list-cards` - 列出现有卡片
- `create-card` - 创建单个卡片
- `delete-card` - 删除卡片

### 5. service-registry

服务注册和管理。

**主要操作：**
- `list-services` - 列出所有服务
- `register-service` - 注册新服务
- `update-service` - 更新服务信息
- `delete-service` - 删除服务
- `validate-service` - 验证服务配置

## Hermes 集成示例

Hermes 可以通过以下方式调用这些 skills：

```javascript
// 示例 1：查询设备 IPv6
const result = await executeSkill('device-monitor', 'get-ipv6', {
  ip: '192.168.9.10'
});

// 示例 2：创建 Lucky 端口和反向代理
await executeSkill('lucky-manager', 'create-port', {
  port: 50010,
  name: 'my-service',
  proxy: {
    domain: 'service.example.com',
    target: 'http://192.168.9.10:3000'
  }
});

// 示例 3：更新 Cloudflare DDNS
await executeSkill('cloudflare-dns', 'update-ddns', {
  domain: 'home.example.com',
  ipv4: '1.2.3.4',
  ipv6: '240e:391:c8a:4071::3e0'
});

// 示例 4：同步 SunPanel 卡片
await executeSkill('sunpanel-sync', 'sync-cards', {
  services: [
    { name: 'Service 1', url: 'http://192.168.9.10:3000' },
    { name: 'Service 2', url: 'http://192.168.9.10:4000' }
  ]
});
```

## 开发新 Skill

创建新 skill 的步骤：

1. 在 `skills/` 目录下创建新文件夹
2. 创建 `skill.mjs` 文件，实现统一接口
3. 创建 `README.md` 文档
4. 在 `examples/` 目录添加调用示例
5. 编写单元测试
6. 更新本文档的 skill 列表

## 测试

每个 skill 都应该有对应的测试文件：

```bash
# 运行所有 skill 测试
npm test -- skills/

# 运行特定 skill 测试
npm test -- skills/device-monitor/
```

## 注意事项

1. **独立性**：每个 skill 应该尽可能独立，减少对其他模块的依赖
2. **配置**：skill 应该从环境变量或配置文件读取配置，不要硬编码
3. **错误处理**：所有错误都应该被捕获并返回统一格式的错误响应
4. **日志**：使用统一的日志格式，方便调试和监控
5. **文档**：每个 skill 必须有完整的 README 和示例代码
6. **版本控制**：skill 应该有版本号，遵循语义化版本规范
