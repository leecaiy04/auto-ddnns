#!/bin/bash

# Auto-DDNNS Skill - 管理 Auto-DDNNS 系统
# 使用方法: ./auto-ddnns.sh <command> [args]

set -e

# 默认 Hub URL
HUB_URL="${HUB_URL:-http://localhost:51000}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数
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

# API 调用函数
api_get() {
    local endpoint="$1"
    curl -s "${HUB_URL}${endpoint}"
}

api_post() {
    local endpoint="$1"
    local data="$2"
    if [ -n "$data" ]; then
        curl -s -X POST "${HUB_URL}${endpoint}" \
            -H "Content-Type: application/json" \
            -d "$data"
    else
        curl -s -X POST "${HUB_URL}${endpoint}"
    fi
}

api_put() {
    local endpoint="$1"
    local data="$2"
    curl -s -X PUT "${HUB_URL}${endpoint}" \
        -H "Content-Type: application/json" \
        -d "$data"
}

api_delete() {
    local endpoint="$1"
    curl -s -X DELETE "${HUB_URL}${endpoint}"
}

# 命令函数
cmd_health() {
    info "检查系统健康状态..."
    result=$(api_get "/api/health")
    echo "$result" | jq '.'
    success "健康检查完成"
}

cmd_overview() {
    info "获取系统概览..."
    result=$(api_get "/api/dashboard/overview")
    echo "$result" | jq '.'
}

cmd_status() {
    info "获取系统状态..."
    result=$(api_get "/api/dashboard/status")
    echo "$result" | jq '.'
}

cmd_services() {
    info "获取服务列表..."
    result=$(api_get "/api/services/list")
    echo "$result" | jq '.'
}

cmd_services_status() {
    info "获取服务状态..."
    result=$(api_get "/api/services/status")
    echo "$result" | jq '.'
}

cmd_add_service() {
    local id="$1"
    local name="$2"
    local device="$3"
    local port="$4"
    local domain="$5"

    if [ -z "$id" ] || [ -z "$name" ] || [ -z "$device" ] || [ -z "$port" ]; then
        error "用法: add-service <id> <name> <device> <port> [domain]"
        exit 1
    fi

    local data="{\"id\":\"$id\",\"name\":\"$name\",\"device\":\"$device\",\"internalPort\":$port"

    if [ -n "$domain" ]; then
        data="$data,\"enableProxy\":true,\"proxyDomain\":\"$domain\""
    fi

    data="$data}"

    info "添加服务: $name ($id)"
    result=$(api_post "/api/services/add" "$data")
    echo "$result" | jq '.'
    success "服务添加成功，已自动触发同步"
}

cmd_delete_service() {
    local id="$1"

    if [ -z "$id" ]; then
        error "用法: delete-service <id>"
        exit 1
    fi

    warn "删除服务: $id"
    result=$(api_delete "/api/services/$id")
    echo "$result" | jq '.'
    success "服务删除成功，已自动触发同步"
}

cmd_sync_full() {
    info "执行完整同步..."
    result=$(api_post "/api/sync/full")
    echo "$result" | jq '.'
    success "完整同步完成"
}

cmd_sync_lucky() {
    info "同步 Lucky 反向代理..."
    result=$(api_get "/api/proxies/sync")
    echo "$result" | jq '.'
    success "Lucky 同步完成"
}

cmd_sync_sunpanel() {
    info "同步 SunPanel 卡片..."
    result=$(api_post "/api/sync/sunpanel")
    echo "$result" | jq '.'
    success "SunPanel 同步完成"
}

cmd_sync_cloudflare() {
    info "同步 Cloudflare DNS..."
    result=$(api_post "/api/cloudflare/sync")
    echo "$result" | jq '.'
    success "Cloudflare 同步完成"
}

cmd_ddns_refresh() {
    info "刷新 DDNS 记录..."
    result=$(api_post "/api/ddns/refresh")
    echo "$result" | jq '.'
    success "DDNS 刷新完成"
}

cmd_ddns_history() {
    info "获取 DDNS 历史..."
    result=$(api_get "/api/ddns/history")
    echo "$result" | jq '.'
}

cmd_devices() {
    info "获取设备列表..."
    result=$(api_get "/api/devices/list")
    echo "$result" | jq '.'
}

cmd_devices_refresh() {
    info "刷新设备状态..."
    result=$(api_post "/api/devices/refresh")
    echo "$result" | jq '.'
    success "设备状态刷新完成"
}

cmd_key_machines() {
    info "获取关键机器..."
    result=$(api_get "/api/devices/key-machines")
    echo "$result" | jq '.'
}

cmd_scan_ports() {
    local device="$1"

    if [ -z "$device" ]; then
        error "用法: scan-ports <device>"
        exit 1
    fi

    info "扫描设备 $device 的端口..."
    result=$(api_post "/api/devices/$device/scan")
    echo "$result" | jq '.'
    success "端口扫描完成"
}

cmd_changelog() {
    info "获取变更日志..."
    result=$(api_get "/api/changelog")
    echo "$result" | jq '.'
}

cmd_proxies() {
    info "获取 Lucky 代理状态..."
    result=$(api_get "/api/proxies")
    echo "$result" | jq '.'
}

cmd_cloudflare_status() {
    info "获取 Cloudflare 状态..."
    result=$(api_get "/api/cloudflare/status")
    echo "$result" | jq '.'
}

# 帮助信息
cmd_help() {
    cat << EOF
Auto-DDNNS Skill - 管理 Auto-DDNNS 系统

用法: $0 <command> [args]

环境变量:
  HUB_URL    Hub API 地址 (默认: http://localhost:51000)

命令:
  基础信息:
    health                    - 健康检查
    overview                  - 系统概览
    status                    - 状态摘要

  服务管理:
    services                  - 服务列表
    services-status           - 服务状态
    add-service <id> <name> <device> <port> [domain]
                              - 添加服务
    delete-service <id>       - 删除服务

  同步控制:
    sync-full                 - 完整同步
    sync-lucky                - Lucky 同步
    sync-sunpanel             - SunPanel 同步
    sync-cloudflare           - Cloudflare 同步
    ddns-refresh              - DDNS 刷新

  设备管理:
    devices                   - 设备列表
    devices-refresh           - 刷新设备
    key-machines              - 关键机器
    scan-ports <device>       - 扫描端口

  其他:
    ddns-history              - DDNS 历史
    changelog                 - 变更日志
    proxies                   - Lucky 代理状态
    cloudflare-status         - Cloudflare 状态
    help                      - 显示帮助

示例:
  # 查看系统状态
  $0 health
  $0 overview

  # 添加服务
  $0 add-service demo "Demo Service" 200 8080 demo.example.com

  # 同步配置
  $0 sync-lucky
  $0 sync-full

  # 查看设备
  $0 devices
  $0 key-machines

  # 使用远程 Hub
  HUB_URL=http://192.168.9.200:51000 $0 status
EOF
}

# 主函数
main() {
    local command="${1:-help}"
    shift || true

    case "$command" in
        health)
            cmd_health
            ;;
        overview)
            cmd_overview
            ;;
        status)
            cmd_status
            ;;
        services)
            cmd_services
            ;;
        services-status)
            cmd_services_status
            ;;
        add-service)
            cmd_add_service "$@"
            ;;
        delete-service)
            cmd_delete_service "$@"
            ;;
        sync-full)
            cmd_sync_full
            ;;
        sync-lucky)
            cmd_sync_lucky
            ;;
        sync-sunpanel)
            cmd_sync_sunpanel
            ;;
        sync-cloudflare)
            cmd_sync_cloudflare
            ;;
        ddns-refresh)
            cmd_ddns_refresh
            ;;
        ddns-history)
            cmd_ddns_history
            ;;
        devices)
            cmd_devices
            ;;
        devices-refresh)
            cmd_devices_refresh
            ;;
        key-machines)
            cmd_key_machines
            ;;
        scan-ports)
            cmd_scan_ports "$@"
            ;;
        changelog)
            cmd_changelog
            ;;
        proxies)
            cmd_proxies
            ;;
        cloudflare-status)
            cmd_cloudflare_status
            ;;
        help|--help|-h)
            cmd_help
            ;;
        *)
            error "未知命令: $command"
            echo ""
            cmd_help
            exit 1
            ;;
    esac
}

# 检查依赖
if ! command -v curl &> /dev/null; then
    error "需要安装 curl"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    warn "建议安装 jq 以获得更好的 JSON 格式化输出"
fi

# 执行主函数
main "$@"
