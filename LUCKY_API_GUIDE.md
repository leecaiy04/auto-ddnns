# 🔍 查找Lucky更新API端点指南

由于无法自动化访问浏览器，需要你手动在浏览器中查看API请求。以下是详细步骤：

## 📝 操作步骤

### 1. 打开Lucky管理界面
```
浏览器访问: http://192.168.3.200:16601/666
```

### 2. 登录（如果需要）
- 输入账号和密码
- 点击登录

### 3. 打开开发者工具
- **Windows/Linux**: 按 `F12` 或 `Ctrl+Shift+I`
- **Mac**: 按 `Cmd+Option+I`

### 4. 切换到Network标签
- 在开发者工具顶部找到 `Network` 标签
- 点击它

### 5. 准备抓包
- 在Network标签中，确保记录按钮是红色状态（正在记录）
- 或者勾选 `Preserve log` 保留日志

### 6. 找一个现有的反向代理规则进行编辑
- 在Lucky界面中找到50000端口（Lucky管理界面HTTPS）
- 点击编辑或设置
- **不要真正修改任何东西**，只是查看请求

### 7. 查看API请求
在Network标签中会看到很多请求，找到：
- 包含 `webservice` 或 `rule` 的请求
- 请求方法可能是 `POST`、`PUT` 或 `GET`
- 响应状态码应该是 `200`

### 8. 点击该请求，查看详细信息

**需要提供的信息**：

#### A. Request URL（完整路径）
例如：
- `/666/api/webservice/editRule`
- `/666/api/webservice/update?key=xxx`
- 等等

#### B. Request Method（请求方法）
- `POST`
- `PUT`
- `GET`
- `PATCH`

#### C. Request Headers（请求头）
特别是：
- `lucky-admin-token`: `eyJhbG...`（完整的token）
- `Content-Type`

#### D. Request Payload（请求体）
点击 `Payload` 或 `Request` 标签查看
复制完整的JSON内容，例如：
```json
{
  "RuleName": "Lucky 管理界面 HTTPS",
  "RuleKey": "qDpYphsVI1g13G1j",
  "ProxyList": [...]
}
```

## 🎯 替代方案（如果找不到编辑API）

### 方案A: 查看添加新规则的API
1. 在50000端口下尝试添加一个新的子规则
2. 填写一些测试数据（域名、目标地址）
3. 点击保存
4. 在Network中找到保存时的API请求

### 方案B: 查看删除子规则的API
1. 找一个可以删除的子规则
2. 点击删除
3. 查看删除时的API请求

### 方案C: 截图方式
如果不确定如何提取信息：
1. 打开开发者工具的Network标签
2. 执行编辑/添加/删除操作
3. 截图Network标签中相关的请求
4. 特别注意：
   - 完整URL
   - Method
   - Headers
   - Payload

## 📸 需要的截图示例

```
Network标签
├── Name              Method    Status
├── webservice/rules   GET       200
├── editRule          POST      200     ← 点击这个
└── ...

Headers标签
Request URL: https://lucky.leecaiy.xyz:50000/666/api/XXXXXX
Method: POST
...
lucky-admin-token: eyJhbG...

Payload标签
{ ... JSON内容 ... }
```

## 🚀 完成后

将以下信息提供给我：
1. 完整的Request URL路径
2. HTTP方法（POST/PUT等）
3. Request Headers中的lucky-admin-token（如果有变化）
4. Request Payload的JSON结构

我就能立即修复代码！
