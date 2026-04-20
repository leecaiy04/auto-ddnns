#!/bin/bash
# Lucky → SunPanel 同步工具安装脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Lucky → SunPanel 同步工具安装"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    echo "请先安装 Node.js 18+"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 创建配置文件
CONFIG_FILE="$ROOT_DIR/config/lucky-to-sunpanel.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo ""
    echo "📝 创建配置文件..."

    mkdir -p "$ROOT_DIR/config"
    cp "$ROOT_DIR/config/lucky-to-sunpanel.json.template" "$CONFIG_FILE"

    echo "⚠️  请编辑配置文件: $CONFIG_FILE"
    echo "   - 设置 Lucky OpenToken"
    echo "   - 确认 SunPanel API Token"
    echo ""
    read -p "按回车继续编辑配置文件..."

    ${EDITOR:-vim} "$CONFIG_FILE"
else
    echo "✅ 配置文件已存在: $CONFIG_FILE"
fi

# 创建必要目录
mkdir -p "$ROOT_DIR/data"
mkdir -p "$ROOT_DIR/logs"

# 设置脚本权限
chmod +x "$SCRIPT_DIR/sync-lucky-to-sunpanel.mjs"

echo ""
echo "🧪 测试连接..."

# 测试同步
cd "$ROOT_DIR"
if node scripts/sync-lucky-to-sunpanel.mjs --init; then
    echo ""
    echo "✅ 初始化成功！"
else
    echo ""
    echo "❌ 初始化失败，请检查配置"
    exit 1
fi

# 询问是否安装定时任务
echo ""
read -p "是否安装 systemd 定时任务？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    USER_SYSTEMD_DIR="$HOME/.config/systemd/user"
    mkdir -p "$USER_SYSTEMD_DIR"

    ln -sf "$ROOT_DIR/scripts/sync-lucky-to-sunpanel.service" "$USER_SYSTEMD_DIR/"
    ln -sf "$ROOT_DIR/scripts/sync-lucky-to-sunpanel.timer" "$USER_SYSTEMD_DIR/"

    systemctl --user daemon-reload
    systemctl --user enable sync-lucky-to-sunpanel.timer
    systemctl --user start sync-lucky-to-sunpanel.timer

    echo "✅ 定时任务已安装并启动"
    echo "   每 5 分钟自动同步一次"
fi

echo ""
echo "🎉 安装完成！"
echo ""
echo "使用方法:"
echo "  node scripts/sync-lucky-to-sunpanel.mjs --sync      # 手动同步"
echo "  node scripts/sync-lucky-to-sunpanel.mjs --status    # 查看状态"
echo "  node scripts/sync-lucky-to-sunpanel.mjs --dry-run   # 预览同步"
echo ""
echo "文档: docs/lucky-to-sunpanel.md"
