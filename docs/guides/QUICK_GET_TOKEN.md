# 快速获取 SunPanel Token

## 方法一：浏览器书签脚本（最简单）

1. **访问 SunPanel 并登录**: http://192.168.9.2:20001

2. **创建书签**: 在浏览器中创建一个新书签，URL 填入以下内容：

```javascript
javascript:(function(){const a=localStorage.getItem('AUTH_TOKEN');if(a){const t=JSON.parse(a);const token=t.data?.token;if(token&&token!==''&&token!=='null'){prompt('SunPanel Token (Ctrl+C 复制):',token);console.log('Token:',token)}else{alert('Token 为空，请先登录')}}else{alert('未找到 AUTH_TOKEN')}})();
```

3. **点击书签**: 登录后点击这个书签，会弹窗显示 token

4. **复制 token** 并运行更新命令：

```bash
node scripts/update-sunpanel-token.mjs
```

---

## 方法二：浏览器控制台（推荐）

1. 访问 http://192.168.9.2:20001 并登录

2. 按 **F12** 打开开发者工具

3. 切换到 **Console** 标签

4. 粘贴并执行以下代码：

```javascript
(function() {
  const authToken = localStorage.getItem('AUTH_TOKEN');
  if (authToken) {
    const parsed = JSON.parse(authToken);
    const token = parsed.data?.token;

    if (token && token !== '' && token !== 'null') {
      console.log('🎉 找到 Token:');
      console.log(token);
      console.log('\n');
      prompt('Token (按 Ctrl+C 复制):', token);
    } else {
      console.log('❌ Token 为空或无效');
      console.log('AUTH_TOKEN 内容:', parsed);
      alert('Token 无效。\n\n解决方法：\n1. 退出登录\n2. 重新登录\n3. 再次运行此脚本');
    }
  } else {
    alert('未找到 AUTH_TOKEN\n\n请先登录 SunPanel');
  }
})();
```

5. 如果 token 无效，按提示退出登录并重新登录，然后再次运行脚本

6. 复制 token 后运行：

```bash
node scripts/update-sunpanel-token.mjs
```

---

## 方法三：监听登录请求（最可靠）

如果 token 一直为空，使用此方法在登录时捕获 token：

1. 访问 http://192.168.9.2:20001

2. 按 **F12** 打开开发者工具

3. 切换到 **Console** 标签

4. 粘贴并执行以下代码：

```javascript
(function() {
  console.log('🔍 Token 监听器已激活');
  console.log('请退出登录并重新登录...\n');

  // 监听 localStorage 变化
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function(key, value) {
    if (key === 'AUTH_TOKEN') {
      try {
        const parsed = JSON.parse(value);
        if (parsed.data && parsed.data.token) {
          console.log('🎉 捕获到 Token:');
          console.log(parsed.data.token);
          console.log('\n');
          alert('Token 已捕获！\n\n' + parsed.data.token);
          prompt('Token (按 Ctrl+C 复制):', parsed.data.token);
        }
      } catch (e) {}
    }
    return originalSetItem.apply(this, arguments);
  };

  alert('✅ 监听器已激活\n\n请退出登录并重新登录');
})();
```

5. 退出登录

6. 重新登录

7. 登录成功后会自动弹窗显示 token

8. 复制 token 后运行：

```bash
node scripts/update-sunpanel-token.mjs
```

---

## 更新 Token 后

```bash
# 重启服务器
npm start

# 或使用 PM2
pm2 restart auto-ddnns
```

---

## 验证 Token

更新后可以测试 token 是否有效：

```bash
# 测试 API 调用
curl -X POST http://192.168.9.2:20001/api/user/getAuthInfo \
  -H "token: YOUR_NEW_TOKEN" \
  -H "Content-Type: application/json"
```

如果返回用户信息则 token 有效。
