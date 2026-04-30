# Lucky Manager Skill

Lucky 反向代理管理 Skill，提供 DDNS、端口监听、反向代理、SSL 证书管理功能。

## 功能概述

- **DDNS 管理**：创建、更新、删除 DDNS 任务
- **端口管理**：管理端口监听和反向代理规则
- **SSL 证书管理**：申请、删除、查询 SSL 证书
- **SunPanel 同步**：将反向代理规则同步到 SunPanel 导航面板
- **状态查询**：获取 Lucky 服务的整体状态

## 安装和配置

### 环境变量

在 `.env` 文件中配置以下变量：

```bash
# Lucky API 配置
LUCKY_API_BASE=http://192.168.9.2:16601/666
LUCKY_OPEN_TOKEN=your_open_token
LUCKY_ADMIN_TOKEN=your_admin_token
LUCKY_HTTPS_PORT=16443
LUCKY_USERNAME=admin
```

### 依赖模块

- `lucky-ddns` - DDNS 管理模块
- `lucky-port-manager` - 端口和反向代理管理模块
- `lucky-ssl` - SSL 证书管理模块
- `sunpanel-sync` - SunPanel 同步模块

## API 文档

### execute(action, params, context)

统一的执行入口。

**参数：**
- `action` (string) - 操作类型
- `params` (object) - 操作参数
- `context` (object) - 上下文信息（可选）

**返回值：** 根据不同的 action 返回不同的结果

---

### manageDDNS(params)

管理 DDNS 任务。

**参数：**
```javascript
{
  action: 'list' | 'create' | 'update' | 'delete',
  taskId: 'string',  // update/delete 时必需
  config: {          // create/update 时必需
    name: 'string',
    domain: 'string',
    provider: 'cloudflare',
    interval: 300
  }
}
```

**示例：**

```javascript
import LuckyManagerSkill from './skills/lucky-manager/index.mjs';

const skill = new LuckyManagerSkill();

// 列出所有 DDNS 任务
const tasks = await skill.execute('manageDDNS', { action: 'list' });

// 创建 DDNS 任务
const result = await skill.execute('manageDDNS', {
  action: 'create',
  config: {
    name: 'my-ddns',
    domain: 'example.com',
    provider: 'cloudflare',
    interval: 300
  }
});

// 删除 DDNS 任务
await skill.execute('manageDDNS', {
  action: 'delete',
  taskId: 'task-123'
});
```

---

### managePort(params)

管理端口监听和反向代理规则。

**参数：**
```javascript
{
  action: 'list' | 'create' | 'update' | 'delete' | 'add-proxy' | 'remove-proxy',
  port: 443,
  proxyConfig: {
    name: 'my-service',
    domain: 'service.example.com',
    target: 'http://192.168.9.10:8080',
    ssl: true
  }
}
```

**示例：**

```javascript
// 列出所有端口
const ports = await skill.execute('managePort', { action: 'list' });

// 创建端口并添加反向代理
const result = await skill.execute('managePort', {
  action: 'create',
  port: 443,
  proxyConfig: {
    name: 'my-service',
    domain: 'service.example.com',
    target: 'http://192.168.9.10:8080',
    ssl: true
  }
});

// 添加反向代理规则到现有端口
await skill.execute('managePort', {
  action: 'add-proxy',
  port: 443,
  proxyConfig: {
    name: 'another-service',
    domain: 'another.example.com',
    target: 'http://192.168.9.20:3000'
  }
});

// 删除反向代理规则
await skill.execute('managePort', {
  action: 'remove-proxy',
  port: 443,
  proxyConfig: { name: 'my-service' }
});

// 删除端口
await skill.execute('managePort', {
  action: 'delete',
  port: 443
});
```

---

### manageSSL(params)

管理 SSL 证书。

**参数：**
```javascript
{
  action: 'list' | 'apply' | 'delete' | 'get-detail',
  certKey: 'string',  // delete/get-detail 时必需
  certConfig: {       // apply 时必需
    remark: 'My Certificate',
    dnsProvider: 'alidns',
    dnsCredentials: {
      AccessKeyId: 'your_key_id',
      AccessKeySecret: 'your_key_secret'
    },
    domains: ['example.com', '*.example.com'],
    email: 'admin@example.com',
    caServer: 'letsencrypt',
    keyType: '2048'
  }
}
```

**示例：**

```javascript
// 列出所有证书
const certs = await skill.execute('manageSSL', { action: 'list' });

// 申请证书
const result = await skill.execute('manageSSL', {
  action: 'apply',
  certConfig: {
    remark: 'My Certificate',
    dnsProvider: 'alidns',
    dnsCredentials: {
      AccessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
      AccessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET
    },
    domains: ['example.com', '*.example.com'],
    email: 'admin@example.com',
    caServer: 'letsencrypt',
    keyType: '2048'
  }
});

// 获取证书详情
const detail = await skill.execute('manageSSL', {
  action: 'get-detail',
  certKey: 'cert-123'
});

// 删除证书
await skill.execute('manageSSL', {
  action: 'delete',
  certKey: 'cert-123'
});
```

---

### syncToSunPanel(params)

同步反向代理规则到 SunPanel。

**参数：**
```javascript
{
  port: 443  // 可选，不指定则同步所有端口
}
```

**示例：**

```javascript
// 同步所有端口的反向代理规则
const result = await skill.execute('syncToSunPanel', {});

// 同步指定端口
const result = await skill.execute('syncToSunPanel', { port: 443 });
```

---

### getStatus()

获取 Lucky 服务状态。

**返回值：**
```javascript
{
  status: 'online',
  ddns: {
    total: 2,
    tasks: [...]
  },
  ports: {
    total: 3,
    list: [...]
  },
  ssl: {
    total: 5,
    certificates: [...]
  }
}
```

**示例：**

```javascript
const status = await skill.execute('getStatus', {});
console.log('Lucky 服务状态:', status);
```

## Hermes 集成示例

### 示例 1：创建完整的反向代理服务

```javascript
import LuckyManagerSkill from './skills/lucky-manager/index.mjs';

async function setupReverseProxy(serviceName, domain, target) {
  const skill = new LuckyManagerSkill();
  
  // 1. 创建端口和反向代理
  const portResult = await skill.execute('managePort', {
    action: 'create',
    port: 443,
    proxyConfig: {
      name: serviceName,
      domain: domain,
      target: target,
      ssl: true
    }
  });
  
  // 2. 申请 SSL 证书
  const certResult = await skill.execute('manageSSL', {
    action: 'apply',
    certConfig: {
      remark: `${serviceName} Certificate`,
      dnsProvider: 'alidns',
      dnsCredentials: {
        AccessKeyId: process.env.ALIYUN_ACCESS_KEY_ID,
        AccessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET
      },
      domains: [domain],
      email: 'admin@example.com'
    }
  });
  
  // 3. 创建 DDNS 任务
  const ddnsResult = await skill.execute('manageDDNS', {
    action: 'create',
    config: {
      name: `${serviceName}-ddns`,
      domain: domain,
      provider: 'cloudflare',
      interval: 300
    }
  });
  
  // 4. 同步到 SunPanel
  await skill.execute('syncToSunPanel', { port: 443 });
  
  return {
    port: portResult,
    certificate: certResult,
    ddns: ddnsResult,
    message: `服务 ${serviceName} 设置完成`
  };
}

// 调用
const result = await setupReverseProxy(
  'my-app',
  'app.example.com',
  'http://192.168.9.10:8080'
);
```

### 示例 2：批量管理服务

```javascript
async function manageServices(services) {
  const skill = new LuckyManagerSkill();
  const results = [];
  
  for (const service of services) {
    try {
      // 创建反向代理
      const result = await skill.execute('managePort', {
        action: 'add-proxy',
        port: 443,
        proxyConfig: {
          name: service.name,
          domain: service.domain,
          target: service.target,
          ssl: true
        }
      });
      
      results.push({
        service: service.name,
        status: 'success',
        result
      });
    } catch (error) {
      results.push({
        service: service.name,
        status: 'error',
        error: error.message
      });
    }
  }
  
  // 统一同步到 SunPanel
  await skill.execute('syncToSunPanel', {});
  
  return results;
}

// 调用
const services = [
  { name: 'app1', domain: 'app1.example.com', target: 'http://192.168.9.10:8080' },
  { name: 'app2', domain: 'app2.example.com', target: 'http://192.168.9.20:3000' },
  { name: 'app3', domain: 'app3.example.com', target: 'http://192.168.9.30:5000' }
];

const results = await manageServices(services);
```

### 示例 3：监控和报告

```javascript
async function generateLuckyReport() {
  const skill = new LuckyManagerSkill();
  
  // 获取整体状态
  const status = await skill.execute('getStatus', {});
  
  // 生成报告
  const report = {
    timestamp: new Date().toISOString(),
    status: status.status,
    summary: {
      ddnsTasks: status.ddns.total,
      ports: status.ports.total,
      certificates: status.ssl.total
    },
    details: {
      ddns: status.ddns.tasks.map(t => ({
        name: t.name,
        domain: t.domain,
        enabled: t.enabled
      })),
      ports: status.ports.list.map(p => ({
        port: p.port,
        proxyCount: p.proxyRules?.length || 0
      })),
      ssl: status.ssl.certificates.map(c => ({
        remark: c.remark,
        domains: c.domains,
        expiresAt: c.expiresAt
      }))
    }
  };
  
  return report;
}
```

## 命令行调用

创建命令行工具 `cli.mjs`：

```javascript
#!/usr/bin/env node
import LuckyManagerSkill from './index.mjs';

const skill = new LuckyManagerSkill();
const [action, subAction, ...args] = process.argv.slice(2);

async function main() {
  try {
    switch (action) {
      case 'ddns':
        const ddnsResult = await skill.execute('manageDDNS', {
          action: subAction,
          ...parseArgs(args)
        });
        console.log(JSON.stringify(ddnsResult, null, 2));
        break;
        
      case 'port':
        const portResult = await skill.execute('managePort', {
          action: subAction,
          ...parseArgs(args)
        });
        console.log(JSON.stringify(portResult, null, 2));
        break;
        
      case 'ssl':
        const sslResult = await skill.execute('manageSSL', {
          action: subAction,
          ...parseArgs(args)
        });
        console.log(JSON.stringify(sslResult, null, 2));
        break;
        
      case 'sync':
        const syncResult = await skill.execute('syncToSunPanel', parseArgs(args));
        console.log(JSON.stringify(syncResult, null, 2));
        break;
        
      case 'status':
        const status = await skill.execute('getStatus', {});
        console.log(JSON.stringify(status, null, 2));
        break;
        
      default:
        console.log('Usage: node cli.mjs <action> <subAction> [args]');
        console.log('Actions: ddns, port, ssl, sync, status');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

function parseArgs(args) {
  // 简单的参数解析逻辑
  const params = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    params[key] = value;
  }
  return params;
}

main();
```

使用方法：

```bash
# 列出所有 DDNS 任务
node skills/lucky-manager/cli.mjs ddns list

# 列出所有端口
node skills/lucky-manager/cli.mjs port list

# 列出所有证书
node skills/lucky-manager/cli.mjs ssl list

# 同步到 SunPanel
node skills/lucky-manager/cli.mjs sync

# 查看状态
node skills/lucky-manager/cli.mjs status
```

## 错误处理

所有方法都会抛出标准错误：

```javascript
try {
  const result = await skill.execute('managePort', {
    action: 'create',
    port: 443,
    proxyConfig: { ... }
  });
} catch (error) {
  console.error('操作失败:', error.message);
  // 错误类型：
  // - 'action is required' - 缺少必需参数
  // - 'Unknown action: xxx' - 未知操作
  // - 'Port xxx not found' - 端口不存在
  // - API 错误信息
}
```

## 注意事项

1. **API 认证**：必须设置 `LUCKY_OPEN_TOKEN` 环境变量
2. **SSL 证书申请**：需要配置 DNS 提供商的 API 凭据
3. **端口冲突**：创建端口前确保端口未被占用
4. **证书域名**：申请证书时域名必须已解析到正确的 IP
5. **SunPanel 同步**：需要配置 `SUNPANEL_API_BASE` 和 `SUNPANEL_API_TOKEN`

## 版本历史

- **1.0.0** (2026-05-01) - 初始版本
  - 支持 DDNS 管理
  - 支持端口和反向代理管理
  - 支持 SSL 证书管理
  - 支持 SunPanel 同步
  - 支持状态查询
