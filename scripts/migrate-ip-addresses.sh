#!/bin/bash
# 批量替换 IP 地址：192.168.3.x -> 192.168.9.x

set -e

echo "开始迁移 IP 地址：192.168.3.x -> 192.168.9.x"
echo "================================================"

# 需要替换的文件列表（排除备份、node_modules、.claude 等目录）
FILES=$(find . -type f \
  \( -name "*.js" -o -name "*.mjs" -o -name "*.json" -o -name "*.md" -o -name ".env*" \) \
  ! -path "*/node_modules/*" \
  ! -path "*/.backup/*" \
  ! -path "*/.claude/*" \
  ! -path "*/backups/*" \
  ! -name "*.example" \
  ! -name "migrate-ip-addresses.sh")

# 统计需要替换的文件数量
COUNT=0
for file in $FILES; do
  if grep -q "192\.168\.3\." "$file" 2>/dev/null; then
    COUNT=$((COUNT + 1))
  fi
done

echo "找到 $COUNT 个文件包含 192.168.3.x 地址"
echo ""

# 执行替换
REPLACED=0
for file in $FILES; do
  if grep -q "192\.168\.3\." "$file" 2>/dev/null; then
    echo "处理: $file"
    # macOS 和 Linux 的 sed 语法不同，这里兼容两者
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' 's/192\.168\.3\./192.168.9./g' "$file"
    else
      sed -i 's/192\.168\.3\./192.168.9./g' "$file"
    fi
    REPLACED=$((REPLACED + 1))
  fi
done

echo ""
echo "================================================"
echo "完成！共替换了 $REPLACED 个文件"
echo ""
echo "请检查以下关键文件："
echo "  - .env"
echo "  - config/hub.json"
echo "  - config/devices.json"
echo "  - central-hub/config/hub.json"
echo ""
echo "建议运行测试确认："
echo "  npm test"
