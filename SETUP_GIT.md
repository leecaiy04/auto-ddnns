# 📝 Git 推送凭证设置指南

## 方法 1：使用凭证助手（推荐）

在仓库目录执行一次推送命令，输入用户名和密码后，Git 会记住凭证：

```bash
cd /home/leecaiy/workspace/auto-dnns
git push origin main
```

输入一次后，后续的推送就不需要再输入密码了。

## 方法 2：在 URL 中嵌入用户名

如果不想使用凭证助手，可以修改 URL 包含用户名：

```bash
git remote set-url origin http://用户名@leecaiy.xyz:33100/leecaiy/auto-dnns
```

然后在推送时只需要输入密码。

## 方法 3：使用 SSH（推荐）

如果服务器支持 SSH，可以切换到 SSH URL：

```bash
git remote set-url origin git@leecaiy.xyz:33100/leecaiy/auto-dnns.git
```

## 🔧 当前状态

当前有 **2 个提交** 等待推送。

**请执行以下命令完成首次推送**：

```bash
cd /home/leecaiy/workspace/auto-dnns
git push origin main
```

输入凭证后，后续会使用自动同步脚本自动推送更改。
