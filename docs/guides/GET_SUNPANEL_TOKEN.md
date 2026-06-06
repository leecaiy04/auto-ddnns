# SunPanel Token 自动获取工具

## 方法 1：浏览器控制台脚本（推荐）

1. 访问 http://192.168.9.2:20001 并登录
2. 按 F12 打开开发者工具
3. 切换到 **Console**（控制台）标签
4. 复制并粘贴以下代码，按回车：

```javascript
// 监听所有网络请求，捕获 token
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch(...args);
    const clone = response.clone();
    try {
      const data = await clone.json();
      if (data.data && data.data.token) {
        console.log('🎉 找到 Token:', data.data.token);
        alert('Token 已复制到剪贴板！请发送给管理员更新配置。');
        navigator.clipboard.writeText(data.data.token);
      }
    } catch (e) {}
    return response;
  };
  console.log('✅ Token 捕获器已激活，请重新登录...');
  alert('请退出登录并重新登录，系统会自动捕获 token');
})();
```

5. 退出登录
6. 重新登录
7. Token 会自动复制到剪贴板并显示在控制台

## 方法 2：直接从浏览器存储读取

如果已经登录，在控制台运行：

```javascript
// 尝试从 localStorage 读取
console.log('LocalStorage:', localStorage);
console.log('SessionStorage:', sessionStorage);

// 尝试从 cookies 读取
console.log('Cookies:', document.cookie);

// 检查所有可能的 token 位置
['token', 'auth_token', 'access_token', 'sunpanel_token'].forEach(key => {
  const value = localStorage.getItem(key) || sessionStorage.getItem(key);
  if (value) {
    console.log(`找到 ${key}:`, value);
  }
});
```

## 方法 3：手动从 Network 标签获取

1. 打开开发者工具（F12）
2. 切换到 **Network** 标签
3. 勾选 **Preserve log**
4. 退出登录并重新登录
5. 在请求列表中找到 `account` 或 `login` 请求
6. 点击该请求 → **Response** 标签
7. 找到 `data.token` 字段并复制

---

## 获取 Token 后

将 token 发送给我，或者直接运行以下命令更新配置：

```bash
# 替换 YOUR_NEW_TOKEN 为实际的 token
cd /vol1/1000/code/auto-ddnns
sed -i 's/SUNPANEL_API_TOKEN=.*/SUNPANEL_API_TOKEN=YOUR_NEW_TOKEN/' .env
npm start
```
