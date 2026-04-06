#!/bin/bash

# ==========================================
# 局域网 IPv4/v6 扫描与阿里云 DDNS 动态更新脚本 (Bash 纯净版)
# 特性：零依赖第三方库，单文件，支持步骤参数控制，自带守护定时模式
#
# 使用方法：
#   bash aliddns_sync.sh scan     (仅执行扫描)
#   bash aliddns_sync.sh ddns     (仅执行DDNS更新)
#   bash aliddns_sync.sh all      (执行单次完整流程，默认)
#   bash aliddns_sync.sh daemon   (作为定时常驻服务运行)
#  pkill -f aliddns_sync.sh

# ==========================================

# --- 环境变量加载 ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/../.env}"

if [ ! -f "$ENV_FILE" ] && [ -f "${SCRIPT_DIR}/.env" ]; then
    ENV_FILE="${SCRIPT_DIR}/.env"
fi

if [ -f "$ENV_FILE" ]; then
    set -a
    . "$ENV_FILE"
    set +a
fi

# --- 阿里云 API 密钥与域名配置 ---
ALIYUN_AK="${ALIYUN_AK:-}"
ALIYUN_SK="${ALIYUN_SK:-}"
DOMAIN="${DOMAIN:-${ALIYUN_DOMAIN:-leecaiy.shop}}"
DOMAIN="$(printf '%s' "$DOMAIN" | cut -d',' -f1 | xargs)"

# --- 路由器 SSH 配置 ---
ROUTER_IP="${ROUTER_IP:-${ROUTER_HOST:-192.168.3.1}}"
ROUTER_USER="${ROUTER_USER:-${ROUTER_USERNAME:-root}}"
ROUTER_PASS="${ROUTER_PASS:-${ROUTER_PASSWORD:-}}"

# --- 守护进程轮询间隔（秒） ---
INTERVAL_SEC="${INTERVAL_SEC:-${DDNS_UPDATE_INTERVAL:-600}}"

# --- 扫描配置 ---
# 可选: "all" (全网段 1~254 穷举全网扫描) 或 "array" (仅扫描以下数组定义的具体 IP)
SCAN_MODE="array" 
TARGET_IPV4_ARRAY=(
    "192.168.3.2"
    "192.168.3.10"
    "192.168.3.152"
    "192.168.3.200"
    "192.168.3.201"
    "192.168.3.254"
    # 按格式在此处继续添加您要定向扫描/绑定的内部 IPv4
)

# --- 端口扫描配置 ---
COMMON_PORTS=(21 22 23 25 53 80 110 135 139 143 443 445 993 995 1433 1521 3306 3389 5000 5432 5900 6379 8000 8080 8443 9000 9200)

# ==========================================

# 预检依赖
command -v curl >/dev/null 2>&1 || { echo >&2 "错误: 缺少 curl 命令，请先安装。"; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo >&2 "错误: 缺少 openssl 命令，请先安装。"; exit 1; }

require_env() {
    local name="$1"
    local value="$2"

    if [ -z "$value" ]; then
        echo >&2 "错误: 请先设置环境变量 $name"
        exit 1
    fi
}

validate_scan_env() {
    require_env "ROUTER_PASSWORD（或 ROUTER_PASS）" "$ROUTER_PASS"
}

validate_ddns_env() {
    require_env "ALIYUN_AK" "$ALIYUN_AK"
    require_env "ALIYUN_SK" "$ALIYUN_SK"
    require_env "DOMAIN（或 ALIYUN_DOMAIN）" "$DOMAIN"
}

json_escape() {
    local value="${1:-}"
    value=${value//\\/\\\\}
    value=${value//"/\\"}
    value=${value//$'\n'/\\n}
    value=${value//$'\r'/\\r}
    value=${value//$'\t'/\\t}
    printf '%s' "$value"
}

aliyun_error_code() {
    printf '%s' "$1" | grep -o '"Code":"[^"]*"' | head -n 1 | cut -d'"' -f4
}

aliyun_error_message() {
    printf '%s' "$1" | grep -o '"Message":"[^"]*"' | head -n 1 | cut -d'"' -f4
}

aliyun_record_id() {
    printf '%s' "$1" | grep -o '"RecordId":"[^"]*"' | head -n 1 | cut -d'"' -f4
}

aliyun_record_value() {
    printf '%s' "$1" | grep -o '"Value":"[^"]*"' | head -n 1 | cut -d'"' -f4
}

aliyun_total_count() {
    printf '%s' "$1" | grep -o '"TotalCount":[0-9]*' | head -n 1 | cut -d':' -f2
}

emit_ddns_result() {
    local domain="$1"
    local host_key="$2"
    local family="$3"
    local record_type="$4"
    local rr="$5"
    local fqdn="$6"
    local value="$7"
    local ipv4="$8"
    local ipv6="$9"
    local action="${10}"
    local success="${11}"
    local record_id="${12}"
    local message="${13}"
    local record_id_json="null"

    if [ -n "$record_id" ]; then
        record_id_json="\"$(json_escape "$record_id")\""
    fi

    printf '__DDNS_RESULT__{"domain":"%s","host":"%s","family":"%s","type":"%s","rr":"%s","fqdn":"%s","value":"%s","hostname":"%s","ipv4":"%s","ipv6":"%s","action":"%s","success":%s,"recordId":%s,"message":"%s"}\n' \
        "$(json_escape "$domain")" \
        "$(json_escape "$host_key")" \
        "$(json_escape "$family")" \
        "$(json_escape "$record_type")" \
        "$(json_escape "$rr")" \
        "$(json_escape "$fqdn")" \
        "$(json_escape "$value")" \
        "$(json_escape "$fqdn")" \
        "$(json_escape "$ipv4")" \
        "$(json_escape "$ipv6")" \
        "$(json_escape "$action")" \
        "$success" \
        "$record_id_json" \
        "$(json_escape "$message")"
}

emit_ddns_summary() {
    local domain="$1"
    local total="$2"
    local success_count="$3"
    local failed_count="$4"
    local skipped_count="$5"
    local added_count="$6"
    local updated_count="$7"
    local status="$8"
    local public_ip="$9"
    local ipv4_total="${10}"
    local ipv4_success_count="${11}"
    local ipv4_failed_count="${12}"
    local ipv4_skipped_count="${13}"
    local ipv4_added_count="${14}"
    local ipv4_updated_count="${15}"
    local ipv6_total="${16}"
    local ipv6_success_count="${17}"
    local ipv6_failed_count="${18}"
    local ipv6_skipped_count="${19}"
    local ipv6_added_count="${20}"
    local ipv6_updated_count="${21}"

    printf '__DDNS_SUMMARY__{"domain":"%s","total":%s,"successCount":%s,"failedCount":%s,"skippedCount":%s,"addedCount":%s,"updatedCount":%s,"status":"%s","publicIp":"%s","ipv4Total":%s,"ipv4SuccessCount":%s,"ipv4FailedCount":%s,"ipv4SkippedCount":%s,"ipv4AddedCount":%s,"ipv4UpdatedCount":%s,"ipv6Total":%s,"ipv6SuccessCount":%s,"ipv6FailedCount":%s,"ipv6SkippedCount":%s,"ipv6AddedCount":%s,"ipv6UpdatedCount":%s}\n' \
        "$(json_escape "$domain")" \
        "$total" \
        "$success_count" \
        "$failed_count" \
        "$skipped_count" \
        "$added_count" \
        "$updated_count" \
        "$(json_escape "$status")" \
        "$(json_escape "$public_ip")" \
        "$ipv4_total" \
        "$ipv4_success_count" \
        "$ipv4_failed_count" \
        "$ipv4_skipped_count" \
        "$ipv4_added_count" \
        "$ipv4_updated_count" \
        "$ipv6_total" \
        "$ipv6_success_count" \
        "$ipv6_failed_count" \
        "$ipv6_skipped_count" \
        "$ipv6_added_count" \
        "$ipv6_updated_count"
}

is_valid_ipv4() {
    local ip="$1"
    if ! printf '%s' "$ip" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; then
        return 1
    fi

    local IFS='.'
    read -r o1 o2 o3 o4 <<< "$ip"
    for octet in "$o1" "$o2" "$o3" "$o4"; do
        if [ "$octet" -lt 0 ] || [ "$octet" -gt 255 ]; then
            return 1
        fi
    done

    return 0
}

fetch_public_ipv4() {
    local configured_ip="${PUBLIC_IPV4:-}"
    if [ -n "$configured_ip" ] && is_valid_ipv4 "$configured_ip"; then
        printf '%s' "$configured_ip"
        return 0
    fi

    local services=(
        'https://api.ipify.org?format=json'
        'https://httpbin.org/ip'
        'https://api.ip.sb/ip'
    )

    for url in "${services[@]}"; do
        local response=""
        response=$(curl -fsS --max-time 5 "$url" 2>/dev/null) || continue

        local candidate=""
        if printf '%s' "$url" | grep -q 'ipify'; then
            candidate=$(printf '%s' "$response" | grep -o '"ip":"[^"]*"' | head -n 1 | cut -d'"' -f4)
        elif printf '%s' "$url" | grep -q 'httpbin'; then
            candidate=$(printf '%s' "$response" | grep -o '"origin":"[^"]*"' | head -n 1 | cut -d'"' -f4 | cut -d',' -f1 | xargs)
        else
            candidate=$(printf '%s' "$response" | tr -d '\r' | xargs)
        fi

        if is_valid_ipv4 "$candidate"; then
            printf '%s' "$candidate"
            return 0
        fi
    done

    return 1
}

# 工具函数：URL 编码
urlencode() {
    local length="${#1}"
    for (( i = 0; i < length; i++ )); do
        local c="${1:i:1}"
        case $c in
            [a-zA-Z0-9.~_-]) printf "$c" ;;
            *) printf '%%%02X' "'$c" ;;
        esac
    done
}

# 工具函数：计算阿里云 Signature 并调起 API 请求
aliyun_api() {
    local action=$1
    shift
    local timestamp=$(date -u "+%Y-%m-%dT%H:%M:%SZ")
    local nonce=$RANDOM$RANDOM
    
    local query="AccessKeyId=$ALIYUN_AK&Action=$action&Format=JSON&SignatureMethod=HMAC-SHA1&SignatureNonce=$nonce&SignatureVersion=1.0&Timestamp=$timestamp&Version=2015-01-09"
    
    # 拼接额外参数
    for param in "$@"; do
        query="${query}&${param}"
    done
    
    # 对参进行字典排序
    local sorted_query=$(echo "$query" | tr '&' '\n' | sort | paste -sd '&' -)
    
    # URL 编码每一个 key 和 value
    local canonicalized=""
    for pair in $(echo "$sorted_query" | tr '&' '\n'); do
        local k="${pair%%=*}"
        local v="${pair#*=}"
        canonicalized="${canonicalized}&${k}=$(urlencode "$v")"
    done
    canonicalized="${canonicalized:1}" # 去除第一个 &
    
    # 构造待签名字符串
    local string_to_sign="GET&%2F&$(urlencode "$canonicalized")"
    
    # 计算 HMAC-SHA1
    # 兼容处理：有时 openssl dgst 传递 -hmac 会有细微版本差异，最通用的是直接传字符串
    local signature=$(echo -n "$string_to_sign" | openssl dgst -sha1 -hmac "${ALIYUN_SK}&" -binary | base64)
    
    # 发送请求
    local req_url="https://alidns.aliyuncs.com/?${canonicalized}&Signature=$(urlencode "$signature")"
    curl -s -k "$req_url"
}

# 辅助函数：从数个 IPv6 中选取稳定地址（排除本地链路 fe80，优先 eui64）
get_stable_ipv6() {
    local ipv6_lines="$1"
    # 过滤fe80
    local globals=$(echo "$ipv6_lines" | grep -v -i '^fe80')
    if [ -z "$globals" ]; then return 1; fi
    
    # 找含ff:fe的
    local eui64=$(echo "$globals" | grep -i 'ff:fe' | head -n 1)
    if [ -n "$eui64" ]; then
        echo "$eui64"
        return 0
    fi
    
    # 找最短的（作为普通SLAAC/固定IP的保守预判）
    echo "$globals" | awk '{ print length, $0 }' | sort -n | cut -d" " -f2- | head -n 1
}

# 辅助函数：检测端口是否开放
check_port() {
    local ip=$1
    local port=$2
    # 尝试连接，1秒超时
    (timeout 1 >/dev/tcp/"$ip"/"$port") >/dev/null 2>&1
    return $?
}

# --- 步骤 1：扫描局域网与路由信息 ---
step_scan() {
    echo ">>> [步骤1] 扫描并提取局域网设备信息"
    
    # 区分跨平台 Ping 和 Arp 命令 (Windows GitBash 下与 Linux 本机略有不同)
    local ping_cmd="ping -c 1 -W 1"
    if uname -a | grep -i "mingw\|msys\|cygwin" >/dev/null; then
        ping_cmd="ping -n 1 -w 500"
    fi

    if [ "$SCAN_MODE" = "array" ]; then
        echo ">>> [模式: 数组提取] 正在 Ping 测试配置的指定 IPv4 列表，唤醒并刷新其本地 ARP..."
        for ip in "${TARGET_IPV4_ARRAY[@]}"; do
            ($ping_cmd "$ip" >/dev/null 2>&1) &
        done
    else
        echo ">>> [模式: 全量扫描] 正在发送局域网 Ping 广播刷新 ARP 表 (1-254) 可能需要数秒停顿..."
        for i in {1..254}; do
            ($ping_cmd 192.168.3.$i >/dev/null 2>&1) &
        done
    fi
    wait
    
    echo "读取局域网 IPv4 和 MAC..."
    arp -a > .arp_table.tmp
    
    echo "通过 SSH 连接路由器获取完整 IPv6 表..."
    > .router_v6.tmp
    if command -v expect >/dev/null 2>&1; then
        expect -c "
            set timeout 15
            spawn ssh -o StrictHostKeyChecking=no ${ROUTER_USER}@${ROUTER_IP}
            expect {
                \"*assword:\" {
                    send \"${ROUTER_PASS}\n\"
                    exp_continue
                }
                \"WAP>\" {
                    send \"ip -6 neigh\n\"
                    expect \"WAP>\"
                    send \"quit\n\"
                }
            }
        " > .router_v6.tmp
    else
        echo "[警告] 未找到 expect 命令。如果您正在 Linux/WSL 下，请使用 'sudo apt install expect' 补充。"
        echo "[提示] 将尝试以免密密钥方式直连一次 (如果在路由器配置过 SSH Key)..."
        ssh -o BatchMode=yes -o StrictHostKeyChecking=no ${ROUTER_USER}@${ROUTER_IP} "ip -6 neigh" > .router_v6.tmp 2>/dev/null
    fi
    
    echo "整理对应关系到 .lan_devices.txt ..."
    > .lan_devices.txt
    
    # 提取所有包含 MAC 的 ARP 行
    grep -i -E '([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}' .arp_table.tmp | while read -r line; do
        # 兼容不同系统输出格式 (IP 通常在前面或中间)
        ipv4=$(echo "$line" | grep -o -E '192\.168\.3\.[0-9]+' | head -n 1)
        mac=$(echo "$line" | grep -o -E '([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}' | tr '-' ':' | tr 'A-Z' 'a-z')
        
        if [ -n "$ipv4" ] && [ -n "$mac" ]; then
            # 若处于指定数组扫描模式，二次过滤不匹配我们既定目标的自带缓存（如网关或长期缓存主机）
            if [ "$SCAN_MODE" = "array" ]; then
                local in_array=0
                for target_ip in "${TARGET_IPV4_ARRAY[@]}"; do
                    if [ "$ipv4" = "$target_ip" ]; then
                        in_array=1
                        break
                    fi
                done
                if [ $in_array -eq 0 ]; then
                    continue
                fi
            fi

            # 从路由器抓取的 ipv6 中映射到对应 MAC 且处于 DEV 状态的记录
            v6_lines=$(grep -i "$mac" .router_v6.tmp | grep -o -E '([a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}|([a-fA-F0-9]{1,4}:)+:[a-fA-F0-9]{0,4}')
            stable_v6=$(get_stable_ipv6 "$v6_lines")
            
            if [ -n "$stable_v6" ]; then
                # 扫描端口
                echo "  |- 正在为 $ipv4 扫描常用端口..."
                open_ports=""
                for port in "${COMMON_PORTS[@]}"; do
                    if check_port "$ipv4" "$port"; then
                        open_ports="${open_ports}${port},"
                    fi
                done
                open_ports=${open_ports%,} # 去掉末尾逗号
                
                echo "$mac|$ipv4|$stable_v6|$open_ports" >> .lan_devices.txt
            fi
        fi
    done
    
    # 去重
    sort -u .lan_devices.txt -o .lan_devices.txt
    echo "[成功] 已提取发现 $(wc -l < .lan_devices.txt) 个含有稳定 IPv6 的局域网设备！"
}

# --- 步骤 2：执行阿里云 DDNS 更新 ---
step_ddns() {
    echo ">>> [步骤2] 更新 Ali DDNS 解析记录"
    if [ ! -f .lan_devices.txt ]; then
        echo "[错误] 缓存文件 .lan_devices.txt 不存在，请先执行 scan 操作！"
        exit 1
    fi

    local total=0
    local success_count=0
    local failed_count=0
    local skipped_count=0
    local added_count=0
    local updated_count=0
    local ipv4_total=0
    local ipv4_success_count=0
    local ipv4_failed_count=0
    local ipv4_skipped_count=0
    local ipv4_added_count=0
    local ipv4_updated_count=0
    local ipv6_total=0
    local ipv6_success_count=0
    local ipv6_failed_count=0
    local ipv6_skipped_count=0
    local ipv6_added_count=0
    local ipv6_updated_count=0
    local public_ipv4=""

    if public_ipv4=$(fetch_public_ipv4); then
        echo "[公网 IPv4] $public_ipv4"
    else
        echo "[警告] 无法获取公网 IPv4，将跳过 A 记录发布"
        public_ipv4=""
    fi

    process_record() {
        local host_key="$1"
        local family="$2"
        local record_type="$3"
        local rr="$4"
        local fqdn="$5"
        local desired_value="$6"
        local base_ipv4="$7"
        local base_ipv6="$8"

        local action="failed"
        local success=false
        local record_id=""
        local message=""
        local res=""
        local describe_error_code=""
        local describe_error_message=""
        local exist_value=""
        local total_count=""

        if [ -z "$desired_value" ]; then
            action="failed"
            success=false
            message="缺少 ${record_type} 目标值"
            echo "  |- 结果: $message"
            failed_count=$((failed_count + 1))
            if [ "$family" = "ipv4" ]; then
                ipv4_total=$((ipv4_total + 1))
                ipv4_failed_count=$((ipv4_failed_count + 1))
            else
                ipv6_total=$((ipv6_total + 1))
                ipv6_failed_count=$((ipv6_failed_count + 1))
            fi
            emit_ddns_result "$DOMAIN" "$host_key" "$family" "$record_type" "$rr" "$fqdn" "$desired_value" "$base_ipv4" "$base_ipv6" "$action" "$success" "$record_id" "$message"
            return
        fi

        total=$((total + 1))
        if [ "$family" = "ipv4" ]; then
            ipv4_total=$((ipv4_total + 1))
        else
            ipv6_total=$((ipv6_total + 1))
        fi

        echo "           目标域名: $fqdn"
        res=$(aliyun_api "DescribeDomainRecords" "DomainName=$DOMAIN" "RRKeyWord=$rr" "TypeKeyWord=$record_type")
        describe_error_code=$(aliyun_error_code "$res")
        describe_error_message=$(aliyun_error_message "$res")

        if [ -n "$describe_error_code" ]; then
            message="DescribeDomainRecords 失败: ${describe_error_code}${describe_error_message:+ - $describe_error_message}"
            echo "  |- 结果: $message"
            failed_count=$((failed_count + 1))
            if [ "$family" = "ipv4" ]; then
                ipv4_failed_count=$((ipv4_failed_count + 1))
            else
                ipv6_failed_count=$((ipv6_failed_count + 1))
            fi
            emit_ddns_result "$DOMAIN" "$host_key" "$family" "$record_type" "$rr" "$fqdn" "$desired_value" "$base_ipv4" "$base_ipv6" "$action" "$success" "$record_id" "$message"
            return
        fi

        record_id=$(aliyun_record_id "$res")
        exist_value=$(aliyun_record_value "$res")
        total_count=$(aliyun_total_count "$res")

        if [ -n "$record_id" ]; then
            if [ "$exist_value" = "$desired_value" ]; then
                action="skip"
                success=true
                skipped_count=$((skipped_count + 1))
                success_count=$((success_count + 1))
                message="记录已存在且云端 ${record_type} 与目标值一致"
                echo "  |- 状态: [跳过更新] $message"
                if [ "$family" = "ipv4" ]; then
                    ipv4_skipped_count=$((ipv4_skipped_count + 1))
                    ipv4_success_count=$((ipv4_success_count + 1))
                else
                    ipv6_skipped_count=$((ipv6_skipped_count + 1))
                    ipv6_success_count=$((ipv6_success_count + 1))
                fi
                emit_ddns_result "$DOMAIN" "$host_key" "$family" "$record_type" "$rr" "$fqdn" "$desired_value" "$base_ipv4" "$base_ipv6" "$action" "$success" "$record_id" "$message"
                return
            fi

            echo "  |- 状态: [执行更新] ${record_type} 发生漂移 ($exist_value -> $desired_value) ..."
            local update_res
            update_res=$(aliyun_api "UpdateDomainRecord" "RecordId=$record_id" "RR=$rr" "Type=$record_type" "Value=$desired_value")
            local update_error_code
            update_error_code=$(aliyun_error_code "$update_res")
            local update_error_message
            update_error_message=$(aliyun_error_message "$update_res")
            local updated_record_id
            updated_record_id=$(aliyun_record_id "$update_res")

            if [ -n "$update_error_code" ] || [ -z "$updated_record_id" ]; then
                failed_count=$((failed_count + 1))
                message="UpdateDomainRecord 失败"
                if [ -n "$update_error_code" ]; then
                    message="${message}: ${update_error_code}${update_error_message:+ - $update_error_message}"
                else
                    message="${message}: 返回结果缺少 RecordId"
                fi
                echo "  |- 结果: $message"
                if [ "$family" = "ipv4" ]; then
                    ipv4_failed_count=$((ipv4_failed_count + 1))
                else
                    ipv6_failed_count=$((ipv6_failed_count + 1))
                fi
                emit_ddns_result "$DOMAIN" "$host_key" "$family" "$record_type" "$rr" "$fqdn" "$desired_value" "$base_ipv4" "$base_ipv6" "$action" "$success" "$record_id" "$message"
                return
            fi

            action="update"
            success=true
            record_id="$updated_record_id"
            updated_count=$((updated_count + 1))
            success_count=$((success_count + 1))
            message="更新成功"
            echo "  |- 结果: $message"
            if [ "$family" = "ipv4" ]; then
                ipv4_updated_count=$((ipv4_updated_count + 1))
                ipv4_success_count=$((ipv4_success_count + 1))
            else
                ipv6_updated_count=$((ipv6_updated_count + 1))
                ipv6_success_count=$((ipv6_success_count + 1))
            fi
            emit_ddns_result "$DOMAIN" "$host_key" "$family" "$record_type" "$rr" "$fqdn" "$desired_value" "$base_ipv4" "$base_ipv6" "$action" "$success" "$record_id" "$message"
            return
        fi

        if [ -n "$total_count" ] && [ "$total_count" != "0" ]; then
            message="DescribeDomainRecords 返回了无法识别的记录结果"
            echo "  |- 结果: $message"
            failed_count=$((failed_count + 1))
            if [ "$family" = "ipv4" ]; then
                ipv4_failed_count=$((ipv4_failed_count + 1))
            else
                ipv6_failed_count=$((ipv6_failed_count + 1))
            fi
            emit_ddns_result "$DOMAIN" "$host_key" "$family" "$record_type" "$rr" "$fqdn" "$desired_value" "$base_ipv4" "$base_ipv6" "$action" "$success" "$record_id" "$message"
            return
        fi

        echo "  |- 状态: [执行新增] 该域名尚无记录，正在添加 ${record_type} 解析 ..."
        local add_res
        add_res=$(aliyun_api "AddDomainRecord" "DomainName=$DOMAIN" "RR=$rr" "Type=$record_type" "Value=$desired_value")
        local add_error_code
        add_error_code=$(aliyun_error_code "$add_res")
        local add_error_message
        add_error_message=$(aliyun_error_message "$add_res")
        local added_record_id
        added_record_id=$(aliyun_record_id "$add_res")

        if [ -n "$add_error_code" ] || [ -z "$added_record_id" ]; then
            failed_count=$((failed_count + 1))
            message="AddDomainRecord 失败"
            if [ -n "$add_error_code" ]; then
                message="${message}: ${add_error_code}${add_error_message:+ - $add_error_message}"
            else
                message="${message}: 返回结果缺少 RecordId"
            fi
            echo "  |- 结果: $message"
            if [ "$family" = "ipv4" ]; then
                ipv4_failed_count=$((ipv4_failed_count + 1))
            else
                ipv6_failed_count=$((ipv6_failed_count + 1))
            fi
            emit_ddns_result "$DOMAIN" "$host_key" "$family" "$record_type" "$rr" "$fqdn" "$desired_value" "$base_ipv4" "$base_ipv6" "$action" "$success" "$record_id" "$message"
            return
        fi

        action="add"
        success=true
        record_id="$added_record_id"
        added_count=$((added_count + 1))
        success_count=$((success_count + 1))
        message="新增成功"
        echo "  |- 结果: $message"
        if [ "$family" = "ipv4" ]; then
            ipv4_added_count=$((ipv4_added_count + 1))
            ipv4_success_count=$((ipv4_success_count + 1))
        else
            ipv6_added_count=$((ipv6_added_count + 1))
            ipv6_success_count=$((ipv6_success_count + 1))
        fi
        emit_ddns_result "$DOMAIN" "$host_key" "$family" "$record_type" "$rr" "$fqdn" "$desired_value" "$base_ipv4" "$base_ipv6" "$action" "$success" "$record_id" "$message"
    }

    while IFS='|' read -r mac ipv4 ipv6 ports; do
        if [ -z "$ipv4" ] || [ -z "$ipv6" ]; then continue; fi

        local last_digit=${ipv4##*.}
        local host_key="$last_digit"
        local ipv4_rr="$last_digit"
        local ipv6_rr="${last_digit}.v6"
        local ipv4_target_domain="${ipv4_rr}.${DOMAIN}"
        local ipv6_target_domain="${ipv6_rr}.${DOMAIN}"

        echo -e "\n[处理项目] IP: $ipv4 -> 提取 IPv6: $ipv6"
        process_record "$host_key" "ipv4" "A" "$ipv4_rr" "$ipv4_target_domain" "$public_ipv4" "$ipv4" "$ipv6"
        process_record "$host_key" "ipv6" "AAAA" "$ipv6_rr" "$ipv6_target_domain" "$ipv6" "$ipv4" "$ipv6"
    done < .lan_devices.txt

    local status="success"
    if [ "$failed_count" -gt 0 ] && [ "$success_count" -gt 0 ]; then
        status="degraded"
    elif [ "$failed_count" -gt 0 ]; then
        status="failed"
    fi

    emit_ddns_summary "$DOMAIN" "$total" "$success_count" "$failed_count" "$skipped_count" "$added_count" "$updated_count" "$status" "$public_ipv4" "$ipv4_total" "$ipv4_success_count" "$ipv4_failed_count" "$ipv4_skipped_count" "$ipv4_added_count" "$ipv4_updated_count" "$ipv6_total" "$ipv6_success_count" "$ipv6_failed_count" "$ipv6_skipped_count" "$ipv6_added_count" "$ipv6_updated_count"

    if [ "$failed_count" -gt 0 ]; then
        return 1
    fi
}

# --- 步骤 4：生成 HTML 静态页面 ---
step_html() {
    echo ">>> [步骤4] 生成静态展示页面 index.html"
    if [ ! -f .lan_devices.txt ]; then
        echo "[错误] 缓存文件 .lan_devices.txt 不存在，请先执行 scan 操作！"
        exit 1
    fi

    local update_time=$(date "+%Y-%m-%d %H:%M:%S")
    
    # 写入 HTML 头部
    cat <<EOF > index.html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>局域网设备状态</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 20px; color: #333; }
        .container { max-width: 1000px; margin: auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { color: #2c3e50; text-align: center; }
        .update-time { text-align: center; color: #7f8c8d; margin-bottom: 20px; font-size: 0.9em; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 12px; border-bottom: 1px solid #ddd; text-align: left; }
        th { background-color: #3498db; color: white; }
        tr:hover { background-color: #f1f1f1; }
        .port-tag { display: inline-block; background: #e67e22; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin: 1px; }
        .ipv6-text { font-family: 'Courier New', Courier, monospace; font-size: 0.85em; word-break: break-all; }
        @media (max-width: 600px) {
            table, thead, tbody, th, td, tr { display: block; }
            th { position: absolute; top: -9999px; left: -9999px; }
            tr { border: 1px solid #ccc; margin-bottom: 5px; }
            td { border: none; border-bottom: 1px solid #eee; position: relative; padding-left: 50%; }
            td:before { position: absolute; top: 6px; left: 6px; width: 45%; padding-right: 10px; white-space: nowrap; font-weight: bold; }
            td:nth-of-type(1):before { content: "MAC"; }
            td:nth-of-type(2):before { content: "IPv4"; }
            td:nth-of-type(3):before { content: "IPv6"; }
            td:nth-of-type(4):before { content: "开放端口"; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>局域网设备状态看板</h1>
        <p class="update-time">最后更新时间：$update_time</p>
        <table>
            <thead>
                <tr>
                    <th>MAC</th>
                    <th>IPv4</th>
                    <th>IPv6 (Stable)</th>
                    <th>开放端口</th>
                </tr>
            </thead>
            <tbody>
EOF

    # 循环写入数据行
    while IFS='|' read -r mac ipv4 ipv6 ports; do
        if [ -z "$ipv4" ]; then continue; fi
        
        local port_html=""
        if [ -n "$ports" ]; then
            IFS=',' read -ra port_arr <<< "$ports"
            for p in "${port_arr[@]}"; do
                port_html="${port_html}<span class='port-tag'>$p</span>"
            done
        else
            port_html="<span style='color:#999'>未发现常用端口</span>"
        fi

        cat <<EOF >> index.html
                <tr>
                    <td>$mac</td>
                    <td><b>$ipv4</b></td>
                    <td class="ipv6-text">$ipv6</td>
                    <td>$port_html</td>
                </tr>
EOF
    done < .lan_devices.txt

    # 写入 HTML 尾部
    cat <<EOF >> index.html
            </tbody>
        </table>
    </div>
</body>
</html>
EOF
    echo "[成功] 已更新静态页面 index.html"
}

# --- 步骤 3：定时任务封装 ---
step_daemon() {
    echo ">>> [步骤3] 开启定时守护模式"
    echo "本脚本将无限循环常驻，每 $((INTERVAL_SEC/60)) 分钟执行一次扫描与比对更新。"
    echo "您可以将此模式放至后台 (如使用 nohup bash $0 daemon &)。"
    
    while true; do
        echo -e "\n=============================================="
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 开始执行新一轮网络扫描和 DDNS 更新..."
        echo "=============================================="
        step_scan
        step_ddns
        step_html
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 流程结束，休眠 ${INTERVAL_SEC} 秒 zzz..."
        sleep $INTERVAL_SEC
    done
}

# ==========================================
# 命令行参数路由
# ==========================================
CMD=${1:-"all"}

case "$CMD" in
    scan)
        validate_scan_env
        step_scan
        ;;
    ddns)
        validate_ddns_env
        step_ddns
        ;;
    html)
        step_html
        ;;
    daemon)
        validate_scan_env
        validate_ddns_env
        step_daemon
        ;;
    all)
        validate_scan_env
        validate_ddns_env
        step_scan
        step_ddns
        step_html
        ;;
    *)
        echo "命令输入错误。可接受的参数如下:"
        echo "  scan   - 仅执行一次 内网Ping探测与 IPv6信息提取步骤"
        echo "  ddns   - 仅执行一次 针对已提取结果的 阿里云DDNS 更新步骤"
        echo "  html   - 仅执行一次 生成 index.html 页面"
        echo "  all    - 默认选项。顺序执行一次完整的 scan -> ddns -> html 流程"
        echo "  daemon - 定时任务循环守护模式，每 ${INTERVAL_SEC} 秒执行一次 complete 全量流程"
        ;;
esac
