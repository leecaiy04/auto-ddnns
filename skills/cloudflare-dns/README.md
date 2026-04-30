# Cloudflare DNS Manager Skill

Cloudflare DNS 记录管理和 DDNS 更新 Skill。

## 功能

- 列出 DNS 记录
- 创建/更新/删除 DNS 记录
- 自动 DDNS 更新（A/AAAA 记录）
- 批量更新设备 DDNS

## 使用示例

```javascript
import CloudflareDNS from './skills/cloudflare-dns/index.mjs';

// 列出所有 A 记录
const records = await CloudflareDNS.listRecords({ type: 'A' });

// 更新 DDNS
const result = await CloudflareDNS.updateDDNS({
  subdomain: 'home',
  ipv4: '1.2.3.4',
  ipv6: '2001:db8::1'
});

// 批量更新
const devices = [
  { id: 'nas', ipv4: '192.168.9.2', ipv6: '240e::1' },
  { id: 'router', ipv4: '192.168.9.1', ipv6: '240e::2' }
];
const results = await CloudflareDNS.batchUpdateDDNS(devices);
```
