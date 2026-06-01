# SunPanel 手动添加卡片指南

**目标**: 将 Auto-DDNNS 中的服务手动添加到 SunPanel 仪表盘

## 📋 需要添加的卡片

根据当前服务配置，需要添加以下卡片：

### 1. Lucky 管理面板
- **服务名称**: Lucky 管理面板
- **外网地址**: https://lucky.leecaiy.shop:55000
- **内网地址**: http://192.168.9.200:16601/666
- **图标地址**: https://lucky.leecaiy.shop/favicon.ico
- **分组**: NAS
- **描述**: Lucky 反向代理管理面板

### 2. FNOS 系统
- **服务名称**: FNOS 系统
- **外网地址**: https://fnos.leecaiy.shop:55000
- **内网地址**: http://192.168.9.200:5566
- **图标地址**: https://fnos.leecaiy.shop/favicon.ico
- **分组**: NAS
- **描述**: FNOS NAS 管理系统
- **状态**: ✅ 已存在（可能需要更新）

### 3. OpenClaw
- **服务名称**: openclaw
- **外网地址**: https://openclaw.leecaiy.shop:55000
- **内网地址**: http://192.168.9.2:16601
- **图标地址**: https://openclaw.leecaiy.shop/favicon.ico
- **分组**: 其他
- **描述**: openclaw on Lucky / SunPanel 服务器

## 🔧 添加步骤

### 步骤 1: 访问 SunPanel
1. 打开浏览器
2. 访问: `http://192.168.9.2:20001`
3. 使用以下凭据登录：
   - 用户名: `leecaiy`
   - 密码: `Li62301014`

### 步骤 2: 确认分组存在
在添加卡片前，确保以下分组已创建：
- ✅ **NAS** - 用于 Lucky 和 FNOS
- ✅ **其他** - 用于 OpenClaw

如果分组不存在，先创建分组：
1. 点击页面上的"添加分组"或"管理分组"
2. 创建名为 "NAS" 的分组
3. 创建名为 "其他" 的分组

### 步骤 3: 添加 Lucky 管理面板卡片

1. **点击"添加卡片"或"+"按钮**

2. **填写卡片信息**：
   ```
   标题: Lucky 管理面板
   外网地址: https://lucky.leecaiy.shop:55000
   内网地址: http://192.168.9.200:16601/666
   图标地址: https://lucky.leecaiy.shop/favicon.ico
   描述: Lucky 反向代理管理面板
   分组: NAS
   ```

3. **保存卡片**

### 步骤 4: 更新 FNOS 系统卡片（如需要）

FNOS 卡片已存在，但可能需要更新：

1. **找到 FNOS 卡片**
2. **点击编辑**
3. **确认/更新信息**：
   ```
   标题: FNOS 系统
   外网地址: https://fnos.leecaiy.shop:55000
   内网地址: http://192.168.9.200:5566
   图标地址: https://fnos.leecaiy.shop/favicon.ico
   描述: FNOS NAS 管理系统
   分组: NAS
   ```
4. **保存更改**

### 步骤 5: 添加 OpenClaw 卡片

1. **点击"添加卡片"或"+"按钮**

2. **填写卡片信息**：
   ```
   标题: openclaw
   外网地址: https://openclaw.leecaiy.shop:55000
   内网地址: http://192.168.9.2:16601
   图标地址: https://openclaw.leecaiy.shop/favicon.ico
   描述: openclaw on Lucky / SunPanel 服务器
   分组: 其他
   ```

3. **保存卡片**

## 📸 预期效果

添加完成后，SunPanel 仪表盘应该显示：

### NAS 分组
```
┌─────────────────┐  ┌─────────────────┐
│  Lucky 管理面板  │  │   FNOS 系统     │
│  [图标]         │  │   [图标]        │
└─────────────────┘  └─────────────────┘
```

### 其他 分组
```
┌─────────────────┐
│   openclaw      │
│   [图标]        │
└─────────────────┘
```

## ✅ 验证步骤

添加完成后，验证卡片是否正常工作：

1. **点击每个卡片**，确认能正常跳转
2. **检查图标**是否正确显示
3. **测试内网地址**（如果在内网环境）

## 🔄 后续自动同步

手动添加卡片后，Auto-DDNNS 系统会在下次同步时：
- 识别已存在的卡片
- 仅更新有变化的内容
- 不会重复创建卡片

## 📝 注意事项

### 关于唯一标识 (onlyName)
SunPanel 使用 `onlyName` 来识别卡片。Auto-DDNNS 使用以下规则：
- Lucky 管理面板: `svc-lucky200`
- FNOS 系统: `svc-fnos`
- OpenClaw: `svc-openclaw`

如果 SunPanel 支持设置 `onlyName`，建议使用上述值，这样未来自动同步时可以正确识别。

### 关于图标
- 图标地址使用服务的 favicon
- 如果图标无法加载，SunPanel 会使用默认图标
- 可以手动上传自定义图标

### 关于地址
- **外网地址**: 用于外网访问，通过 DDNS 域名
- **内网地址**: 用于内网访问，直接连接设备 IP
- SunPanel 会根据当前网络环境自动选择合适的地址

## 🆘 故障排查

### 问题 1: 图标无法显示
**解决方案**:
- 检查图标 URL 是否可访问
- 尝试使用其他图标地址
- 手动上传图标文件

### 问题 2: 卡片无法访问
**解决方案**:
- 检查服务是否正在运行
- 验证 Lucky 反向代理配置
- 检查防火墙设置

### 问题 3: 分组不存在
**解决方案**:
- 先创建对应的分组
- 然后再添加卡片

## 📞 需要帮助？

如果遇到问题：
1. 检查 SunPanel 日志
2. 验证服务是否可访问
3. 查看 Auto-DDNNS 的 DDNS 域名发布状态面板

---

**文档创建时间**: 2026-06-01  
**适用版本**: Auto-DDNNS v2.0.0 + SunPanel
