# SunPanel 卡片清理指南

## 问题说明

当前部署的 SunPanel 版本的删除 API 端点（`/api/panel/itemIcon/delete`）返回 HTML 而不是 JSON，导致自动化删除失败。

**测试结果：**
- OpenAPI `/openapi/v1/item/delete` → 返回 HTML ❌
- 内部 API `/api/panel/itemIcon/delete` → 返回 HTML ❌
- 所有删除请求返回 200 状态码，但响应是 HTML 页面

## 解决方案

### 方案一：手动在 UI 中删除（推荐）

1. 访问 http://192.168.9.2:20001
2. 登录管理员账号
3. 在每个卡片上点击"..."菜单
4. 选择"删除"
5. 确认删除

### 方案二：使用浏览器控制台批量删除

1. 访问 http://192.168.9.2:20001 并登录
2. 按 **F12** 打开开发者工具
3. 切换到 **Console** 标签
4. 粘贴并执行以下代码：

```javascript
(async function() {
  console.log('🗑️ 开始批量删除所有卡片...\n');

  const response = await fetch('/api/panel/itemIcon/getListAllGroup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  const data = await response.json();
  let deleted = 0;
  let failed = 0;

  if (data.code === 0 && data.data && data.data.list) {
    for (const group of data.data.list) {
      if (group.itemInfos && Array.isArray(group.itemInfos)) {
        for (const item of group.itemInfos) {
          try {
            const delResponse = await fetch('/api/panel/itemIcon/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: item.id })
            });

            const contentType = delResponse.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const delData = await delResponse.json();
              if (delData.code === 0) {
                console.log(`✅ 已删除: ${item.title}`);
                deleted++;
              } else {
                console.log(`❌ 删除失败: ${item.title} - ${delData.msg}`);
                failed++;
              }
            } else {
              console.log(`❌ API 不可用: ${item.title} - 返回 HTML`);
              failed++;
            }
          } catch (e) {
            console.log(`❌ 错误: ${item.title} - ${e.message}`);
            failed++;
          }

          await new Promise(r => setTimeout(r, 100));
        }
      }
    }
  }

  console.log(`\n📊 统计:`);
  console.log(`   成功: ${deleted}`);
  console.log(`   失败: ${failed}`);
})();
```

**如果 API 不可用**（返回 HTML），你将看到 "API 不可用" 错误，此时只能使用方案一手动删除。

### 方案三：清空本地同步状态（不删除远端）

如果你只想清理本地状态记录，不实际删除 SunPanel 上的卡片：

```bash
curl -X POST http://192.168.9.200:51000/api/services/purge-remote \
  -H "Content-Type: application/json" \
  -d '{"sunpanelOnly": true, "softDelete": true}'
```

这会：
- ✅ 清理本地 `syncStatus` 记录
- ❌ 不尝试删除远端卡片
- ℹ️ 下次同步时会重新创建卡片（如果服务还存在）

## 排查步骤

如果你想验证 API 是否可用：

```bash
# 获取第一个卡片的 ID
CARD_ID=$(curl -s -X POST http://192.168.9.2:20001/api/panel/itemIcon/getListAllGroup | \
  jq -r '.data.list[0].itemInfos[0].id')

echo "测试删除卡片 ID: $CARD_ID"

# 尝试删除
curl -X POST http://192.168.9.2:20001/api/panel/itemIcon/delete \
  -H "Content-Type: application/json" \
  -d "{\"id\": $CARD_ID}" \
  -s | head -5

# 如果返回 <!DOCTYPE html> 则 API 不可用
```

## 可能的原因

1. **SunPanel 版本不支持 API 删除** - 某些版本可能只允许通过 UI 删除
2. **权限限制** - API 删除可能需要特殊权限或配置
3. **API 端点变更** - 新版本可能改变了端点路径
4. **功能被禁用** - 管理员可能禁用了 API 删除功能

## 建议

**短期方案：** 使用方案一手动删除

**长期方案：** 
1. 升级 SunPanel 到最新版本
2. 检查 SunPanel 文档，确认 API 删除的正确用法
3. 联系 SunPanel 开发者确认 API 端点状态

## 更新日志

- 2026-06-06: 确认删除 API 不可用，创建此文档
- 测试环境: SunPanel @ http://192.168.9.2:20001
