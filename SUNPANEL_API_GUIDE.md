# 🔍 SunPanel API认证修复指南

## 📋 发现的问题

从SunPanel的JavaScript代码分析发现：
- SunPanel使用 **Bearer Token** 认证
- 格式：`Authorization: Bearer ${token}`
- 不是简单的 `token` header

## 🎯 解决方案

### 方案1: 获取正确的API Token

请按以下步骤操作：

#### 步骤1: 登录SunPanel
```
浏览器访问: http://192.168.3.200:20001
```

#### 步骤2: 打开开发者工具
- **Windows/Linux**: 按 `F12`
- **Mac**: 按 `Cmd+Option+I`

#### 步骤3: 切换到Network标签
- 点击 `Network` 标签
- 刷新页面

#### 步骤4: 找到API请求
在Network列表中找到任意一个请求，点击查看：
- **Headers** 标签
- 查找 `Authorization` header
- 复制完整的token（Bearer后面的部分）

#### 步骤5: 更新配置文件
将获取的token更新到 `.env` 文件：
```bash
SUNPANEL_API_TOKEN=你的新token
```

### 方案2: 直接使用浏览器Console获取

1. 登录 http://192.168.3.200:20001
2. F12 打开开发者工具
3. 切换到 **Console** 标签
4. 输入以下代码：
```javascript
localStorage.getItem('token')
// 或者
sessionStorage.getItem('token')
// 或者
JSON.parse(localStorage.getItem('sun-panel-storage')).token
```
5. 复制显示的token

### 方案3: 查看Application Storage

1. 登录后按 F12
2. 切换到 **Application** 标签
3. 左侧找到 **Local Storage** → http://192.168.3.200:20001
4. 查找 `token` 或 `sun-panel-storage` 键
5. 复制token值

## 🧪 测试新Token

获取新token后，运行以下命令测试：

```bash
TOKEN="你的新token"

curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://192.168.3.200:20001/openapi/v1/itemGroup/getList
```

如果返回JSON数据而不是400错误，说明token有效。

## 📝 需要的信息

请提供以下任意一种信息：

### A. 完整的Authorization Header
例如：
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### B. 从浏览器Console获取的token
例如：
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3XX...
```

### C. 浏览器Network请求截图
包含：
- Request URL
- Request Headers (特别是Authorization)
- Response

---

## 🔧 我会做的修复

获取正确token后，我将：
1. 更新 `sunpanel-api.mjs` 使用 `Authorization: Bearer` header
2. 修复API调用格式
3. 测试完整功能

预计修复时间：5分钟
