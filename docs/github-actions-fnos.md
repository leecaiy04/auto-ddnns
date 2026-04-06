# GitHub Actions 部署到飞牛 OS

当前仓库已提供手动触发的工作流：`.github/workflows/deploy-fnos.yml`。

## 设计说明

- 只允许部署 `main` 分支
- 只支持手动触发，不会自动拉取或自动发布
- 运行在飞牛 OS 本机的 `self-hosted runner`
- 工作流执行的动作是：更新代码、安装依赖、重启 `auto-dnns` 服务、检查健康接口

## 为什么必须用 self-hosted runner

飞牛主机当前地址是局域网地址 `192.168.3.200`。GitHub 官方托管 runner 无法直接访问局域网私有地址，所以必须在飞牛 OS 或同一局域网机器上安装 `self-hosted runner`。

推荐直接安装在飞牛主机上，并添加标签：`fnos`

## 一次性配置步骤

### 1. 在 GitHub 仓库里创建 Runner

进入仓库：

- `Settings`
- `Actions`
- `Runners`
- `New self-hosted runner`
- 选择 `Linux` / `x64`

GitHub 会给出一组安装命令，在飞牛 OS 上执行即可。

### 2. Runner 安装建议目录

建议安装到：`/vol1/1000/code/actions-runner`

并在配置时添加标签：`fnos`

### 3. 安装为系统服务

按 GitHub 页面给出的命令执行 `svc.sh install` 和 `svc.sh start`，确保重启后依然在线。

### 4. 配置仓库 Secret

在仓库中新增 Secret：

- `FOS_SUDO_PASSWORD`：飞牛主机上用于执行 `sudo systemctl restart auto-dnns` 的密码

## 工作流行为

工作流触发后会执行：

1. 检查当前 ref 是否为 `main`
2. 进入 `/vol1/1000/code/deplay/auto-dnns`
3. 执行 `git fetch --prune origin main`
4. 执行 `git checkout main`
5. 执行 `git pull --ff-only origin main`
6. 执行 `npm install`
7. 重启 `auto-dnns`
8. 检查 `http://127.0.0.1:51100/api/health`

## 手动触发方式

在 GitHub 仓库页面打开：

- `Actions`
- `Deploy to FNOS`
- `Run workflow`

确保选择的是 `main` 分支。

## 当前部署目标

- 代码目录：`/vol1/1000/code/deplay/auto-dnns`
- 服务名：`auto-dnns`
- 健康接口：`http://127.0.0.1:51100/api/health`

