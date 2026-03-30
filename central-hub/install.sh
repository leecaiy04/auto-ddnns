#!/bin/bash
# Central Hub 安装脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Central Hub 安装脚本"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    echo "请先安装 Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js 版本: $NODE_VERSION"

# 进入目录
cd "$SCRIPT_DIR"

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm install

# 创建配置文件
CONFIG_FILE="$ROOT_DIR/config/central-hub.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo ""
    echo "📝 创建配置文件..."

    mkdir -p "$ROOT_DIR/config"
    cp "$SCRIPT_DIR/config/central-hub.json.template" "$CONFIG_FILE"

    echo "⚠️  请编辑配置文件: $CONFIG_FILE"
    echo "   - 设置 Lucky OpenToken"
    echo "   - 确认 DDNS 脚本路径"
    echo "   - 确认 SunPanel API Token"
    echo ""
    read -p "按回车打开编辑器 (或 Ctrl+C 取消)..."

    ${EDITOR:-vim} "$CONFIG_FILE"
else
    echo "✅ 配置文件已存在: $CONFIG_FILE"
fi

# 创建必要目录
echo ""
echo "📁 创建必要目录..."
mkdir -p "$ROOT_DIR/data/backups"
mkdir -p "$ROOT_DIR/logs"

# 测试启动
echo ""
echo "🧪 测试启动服务..."
timeout 5 node server.mjs &
PID=$!
sleep 2

if ps -p $PID > /dev/null; then
    kill $PID 2>/dev/null || true
    echo "✅ 服务启动测试成功"
else
    echo "❌ 服务启动失败，请检查配置"
    exit 1
fi

# 询问是否安装 systemd 服务
echo ""
read -p "是否安装 systemd 服务？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    USER_SYSTEMD_DIR="$HOME/.config/systemd/user"
    mkdir -p "$USER_SYSTEMD_DIR"

    ln -sf "$SCRIPT_DIR/central-hub.service" "$USER_SYSTEMD_DIR/"

    systemctl --user daemon-reload
    systemctl --user enable central-hub.service

    echo ""
    echo "✅ systemd 服务已安装"
    echo ""
    echo "使用方法:"
    echo "  systemctl --user start central-hub   # 启动服务"
    echo "  systemctl --user stop central-hub    # 停止服务"
    echo "  systemctl --user status central-hub  # 查看状态"
    echo "  journalctl --user -u central-hub -f  # 查看日志"
    echo ""

    read -p "是否现在启动服务？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        systemctl --user start central-hub
        sleep 2
        systemctl --user status central-hub --no-pager
    fi
fi

echo ""
echo "🎉 安装完成！"
echo ""
echo "使用方法:"
echo "  开发模式: npm run dev"
echo "  生产模式: npm start"
echo "  或使用 systemd: systemctl --user start central-hub"
echo ""
echo "API 文档: http://localhost:3000/api"
echo "健康检查: curl http://localhost:3000/api/health"
echo ""
