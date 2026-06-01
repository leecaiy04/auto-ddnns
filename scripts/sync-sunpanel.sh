#!/bin/bash

# SunPanel 自动同步脚本
# 用于手动触发 SunPanel 卡片同步

set -e

# 配置
SUNPANEL_API_BASE="${SUNPANEL_API_BASE:-http://192.168.9.2:20001/openapi/v1}"
SUNPANEL_TOKEN="${SUNPANEL_TOKEN:-dqc78q52pck8mun76wcxkolr9a25zrjc}"
HUB_URL="${HUB_URL:-http://localhost:51000}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# SunPanel API 调用
sunpanel_api() {
    local endpoint="$1"
    local data="$2"

    curl -s -X POST "${SUNPANEL_API_BASE}${endpoint}" \
        -H "token: ${SUNPANEL_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$data"
}

# 获取分组列表
get_groups() {
    sunpanel_api "/itemGroup/getList" "{}"
}

# 创建分组
create_group() {
    local title="$1"
    local onlyName="$2"

    info "创建分组: $title ($onlyName)"
    result=$(sunpanel_api "/itemGroup/create" "{\"title\":\"$title\",\"onlyName\":\"$onlyName\"}")

    if echo "$result" | jq -e '.code == 0' > /dev/null 2>&1; then
        success "分组创建成功: $title"
        return 0
    else
        msg=$(echo "$result" | jq -r '.msg // "未知错误"')
        if [[ "$msg" == *"already exists"* ]] || [[ "$msg" == *"已存在"* ]]; then
            warn "分组已存在: $title"
            return 0
        else
            error "分组创建失败: $msg"
            return 1
        fi
    fi
}

# 获取卡片信息
get_item() {
    local onlyName="$1"
    sunpanel_api "/item/getInfoByOnlyName" "{\"onlyName\":\"$onlyName\"}"
}

# 创建卡片
create_item() {
    local title="$1"
    local url="$2"
    local onlyName="$3"
    local iconUrl="$4"
    local lanUrl="$5"
    local description="$6"
    local itemGroupOnlyName="$7"

    info "创建卡片: $title ($onlyName)"

    local data=$(cat <<EOF
{
    "title": "$title",
    "url": "$url",
    "onlyName": "$onlyName",
    "iconUrl": "$iconUrl",
    "lanUrl": "$lanUrl",
    "description": "$description",
    "itemGroupOnlyName": "$itemGroupOnlyName",
    "isSaveIcon": false
}
EOF
)

    result=$(sunpanel_api "/item/create" "$data")

    if echo "$result" | jq -e '.code == 0' > /dev/null 2>&1; then
        success "卡片创建成功: $title"
        return 0
    else
        msg=$(echo "$result" | jq -r '.msg // "未知错误"')
        error "卡片创建失败: $msg"
        return 1
    fi
}

# 更新卡片
update_item() {
    local title="$1"
    local url="$2"
    local onlyName="$3"
    local iconUrl="$4"
    local lanUrl="$5"
    local description="$6"
    local itemGroupOnlyName="$7"

    info "更新卡片: $title ($onlyName)"

    local data=$(cat <<EOF
{
    "title": "$title",
    "url": "$url",
    "onlyName": "$onlyName",
    "iconUrl": "$iconUrl",
    "lanUrl": "$lanUrl",
    "description": "$description",
    "itemGroupOnlyName": "$itemGroupOnlyName",
    "isSaveIcon": false
}
EOF
)

    result=$(sunpanel_api "/item/update" "$data")

    if echo "$result" | jq -e '.code == 0' > /dev/null 2>&1; then
        success "卡片更新成功: $title"
        return 0
    else
        msg=$(echo "$result" | jq -r '.msg // "未知错误"')
        error "卡片更新失败: $msg"
        return 1
    fi
}

# 删除卡片
delete_item() {
    local onlyName="$1"

    info "删除卡片: $onlyName"

    result=$(sunpanel_api "/item/delete" "{\"onlyName\":\"$onlyName\"}")

    if echo "$result" | jq -e '.code == 0' > /dev/null 2>&1; then
        success "卡片删除成功: $onlyName"
        return 0
    else
        msg=$(echo "$result" | jq -r '.msg // "未知错误"')
        error "卡片删除失败: $msg"
        return 1
    fi
}

# 同步单个服务
sync_service() {
    local id="$1"
    local name="$2"
    local domain="$3"
    local port="$4"
    local lanUrl="$5"
    local iconUrl="$6"
    local description="$7"
    local group="$8"

    local onlyName="svc-$id"
    local url="https://${domain}:${port}"

    info "同步服务: $name"

    # 检查卡片是否存在
    result=$(get_item "$onlyName")

    if echo "$result" | jq -e '.code == 0' > /dev/null 2>&1; then
        # 卡片存在，更新
        update_item "$name" "$url" "$onlyName" "$iconUrl" "$lanUrl" "$description" "$group"
    elif echo "$result" | jq -e '.code == 1203' > /dev/null 2>&1; then
        # 卡片不存在，创建
        create_item "$name" "$url" "$onlyName" "$iconUrl" "$lanUrl" "$description" "$group"
    else
        msg=$(echo "$result" | jq -r '.msg // "未知错误"')
        error "检查卡片失败: $msg"
        return 1
    fi
}

# 主函数
main() {
    local mode="${1:-sync}"  # sync 或 purge

    if [ "$mode" = "purge" ]; then
        info "开始清空 SunPanel 所有卡片..."
        purge_all_items
        exit 0
    fi

    info "开始 SunPanel 自动同步..."

    # 检查依赖
    if ! command -v jq &> /dev/null; then
        error "需要安装 jq"
        exit 1
    fi

    if ! command -v curl &> /dev/null; then
        error "需要安装 curl"
        exit 1
    fi

    # 1. 确保分组存在
    info "步骤 1: 检查并创建分组"
    create_group "NAS" "nas" || true
    create_group "服务器" "服务器" || true
    create_group "其他" "其他" || true

    echo ""

    # 2. 获取服务列表
    info "步骤 2: 获取服务列表"
    services=$(curl -s "${HUB_URL}/api/services/list")

    if [ -z "$services" ]; then
        error "无法获取服务列表"
        exit 1
    fi

    echo ""

    # 3. 清理不在服务列表中的卡片
    info "步骤 3: 清理无效卡片"
    cleanup_invalid_items

    echo ""

    # 4. 同步每个服务
    info "步骤 4: 同步服务卡片"

    # Lucky 管理面板
    sync_service \
        "lucky200" \
        "Lucky 管理面板" \
        "lucky.leecaiy.shop" \
        "55000" \
        "http://192.168.9.200:16601/666" \
        "https://lucky.leecaiy.shop/favicon.ico" \
        "Lucky 反向代理管理面板" \
        "nas"

    echo ""

    # FNOS 系统
    sync_service \
        "fnos" \
        "FNOS 系统" \
        "fnos.leecaiy.shop" \
        "55000" \
        "http://192.168.9.200:5566" \
        "https://fnos.leecaiy.shop/favicon.ico" \
        "FNOS NAS 管理系统" \
        "nas"

    echo ""

    # OpenClaw
    sync_service \
        "openclaw" \
        "openclaw" \
        "openclaw.leecaiy.shop" \
        "55000" \
        "http://192.168.9.2:16601" \
        "https://openclaw.leecaiy.shop/favicon.ico" \
        "openclaw on Lucky / SunPanel 服务器" \
        "其他"

    echo ""
    success "SunPanel 同步完成！"
}

# 清理无效卡片
cleanup_invalid_items() {
    # 定义有效的卡片列表（Auto-DDNNS 管理的服务）
    local valid_items=("svc-lucky200" "svc-fnos" "svc-openclaw")

    info "检查并删除无效卡片..."

    # 尝试删除可能存在的其他卡片
    # 这里列出一些常见的测试卡片名称
    local test_items=("test" "demo" "example" "app" "service")

    for item in "${test_items[@]}"; do
        result=$(get_item "$item")
        if echo "$result" | jq -e '.code == 0' > /dev/null 2>&1; then
            warn "发现测试卡片: $item"
            delete_item "$item" || true
        fi
    done

    # 检查是否有不在有效列表中的 svc- 开头的卡片
    # 由于 API 限制，我们只能逐个检查已知的服务
    info "清理完成"
}

# 清空所有卡片（危险操作）
purge_all_items() {
    warn "⚠️  警告：此操作将删除 SunPanel 中所有 Auto-DDNNS 管理的卡片！"

    local items=("svc-lucky200" "svc-fnos" "svc-openclaw")

    for item in "${items[@]}"; do
        result=$(get_item "$item")
        if echo "$result" | jq -e '.code == 0' > /dev/null 2>&1; then
            delete_item "$item" || true
        else
            info "卡片不存在，跳过: $item"
        fi
    done

    success "清空完成"
}

# 执行主函数
main "$@"
