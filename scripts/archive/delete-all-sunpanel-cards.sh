#!/bin/bash
# 删除所有 SunPanel 卡片的临时脚本

TOKEN="dqc78q52pck8mun76wcxkolr9a25zrjc"
BASE_URL="http://192.168.9.2:20001/openapi/v1"

echo "🔍 正在获取所有 SunPanel 卡片..."

# 获取所有分组
groups=$(curl -s -H "token: $TOKEN" -H "Content-Type: application/json" -X POST "$BASE_URL/itemGroup/getList")

# 提取分组 onlyName
group_names=$(echo "$groups" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for group in data['data']['list']:
    print(group['onlyName'])
")

echo "📋 找到的分组:"
echo "$group_names"
echo ""

# 由于 OpenAPI 的 getInfo 不返回 items，我们需要手动输入卡片名称
echo "⚠️  由于 API 限制，无法自动获取卡片列表"
echo "请访问 http://192.168.9.2:20001 查看所有卡片的名称（onlyName）"
echo ""
echo "然后运行以下命令删除（替换 svc-xxx 为实际的卡片名称）:"
echo ""
echo "  CARDS='svc-card1 svc-card2 svc-card3'"
echo "  for card in \$CARDS; do"
echo "    curl -s -H 'token: $TOKEN' -H 'Content-Type: application/json' -X POST \\"
echo "      -d '{\"onlyName\": \"'\$card'\"}' \\"
echo "      $BASE_URL/item/delete"
echo "    echo \"已删除: \$card\""
echo "  done"
echo ""
echo "或者使用 Auto-DDNNS 的 API:"
echo ""
echo "  curl -X POST http://192.168.9.200:51000/api/services/purge-remote \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"sunpanelOnlyNames\": [\"svc-card1\", \"svc-card2\", \"svc-card3\"]}'"
