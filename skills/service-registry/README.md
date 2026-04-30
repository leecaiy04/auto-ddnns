# Service Registry Skill

服务注册和发现 Skill。

## 功能

- 注册服务
- 注销服务
- 列出所有服务
- 获取服务状态
- 批量注册服务

## 使用示例

```javascript
import ServiceRegistry from './skills/service-registry/index.mjs';

// 注册服务
const result = await ServiceRegistry.register({
  name: 'my-app',
  url: 'https://app.example.com',
  type: 'web',
  metadata: { version: '1.0.0' }
});

// 列出所有服务
const services = await ServiceRegistry.list();

// 批量注册
const services = [
  { name: 'app1', url: 'https://app1.com', type: 'web' },
  { name: 'app2', url: 'https://app2.com', type: 'api' }
];
const results = await ServiceRegistry.batchRegister(services);
```
