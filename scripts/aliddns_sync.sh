#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${PROJECT_ROOT}/.env}"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || true)}"
SYNC_SCRIPT="${SYNC_SCRIPT:-${SCRIPT_DIR}/sync_private_ipv6_ddns.py}"
QUERY_SCRIPT="${QUERY_SCRIPT:-${SCRIPT_DIR}/query_device_v6.py}"
TARGETS_CONFIG="${DDNS_TARGETS_CONFIG:-${PROJECT_ROOT}/config/private_ipv6_ddns_targets.json}"
STATE_DIR="${DDNS_STATE_DIR:-${PROJECT_ROOT}/data/ddns}"
STATE_JSON="${STATE_DIR}/last_sync.json"
DOMAIN_VALUE="${DOMAIN:-${ALIYUN_DOMAIN:-}}"
INTERVAL_SEC="${INTERVAL_SEC:-${DDNS_UPDATE_INTERVAL:-600}}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "缺少命令: $1" >&2; exit 1; }
}

ensure_ready() {
  require_cmd bash
  if [[ -z "${PYTHON_BIN}" ]]; then
    echo "未找到 python3，无法执行新的 DDNS Python 工作流" >&2
    exit 1
  fi
  [[ -f "${SYNC_SCRIPT}" ]] || { echo "缺少脚本: ${SYNC_SCRIPT}" >&2; exit 1; }
  [[ -f "${QUERY_SCRIPT}" ]] || { echo "缺少脚本: ${QUERY_SCRIPT}" >&2; exit 1; }
  [[ -f "${TARGETS_CONFIG}" ]] || { echo "缺少配置文件: ${TARGETS_CONFIG}" >&2; exit 1; }
  mkdir -p "${STATE_DIR}"
}

run_sync() {
  ensure_ready
  local -a cmd=("${PYTHON_BIN}" "${SYNC_SCRIPT}" --config "${TARGETS_CONFIG}" --json)
  if [[ -n "${DOMAIN_VALUE}" ]]; then
    cmd+=(--domain "${DOMAIN_VALUE}")
  fi
  if [[ -f "${ENV_FILE}" ]]; then
    export ENV_FILE
  fi
  export DDNS_TARGETS_CONFIG="${TARGETS_CONFIG}"
  local output
  output="$("${cmd[@]}")"
  printf '%s
' "${output}" | tee "${STATE_JSON}"
}

render_html_summary() {
  ensure_ready
  if [[ ! -f "${STATE_JSON}" ]]; then
    echo "暂无最近一次 DDNS JSON 结果；请先执行 bash scripts/aliddns_sync.sh ddns"
    return 0
  fi
  "${PYTHON_BIN}" - <<'PY' "${STATE_JSON}"
import json, sys
from pathlib import Path
p = Path(sys.argv[1])
data = json.loads(p.read_text(encoding='utf-8'))
results = data.get('results', [])
print(f"DDNS 最近一次执行域名: {data.get('domain')}")
for item in results:
    status = item.get('status')
    fqdn = item.get('fqdn')
    ipv4 = item.get('ipv4')
    best = item.get('best_ipv6') or '-'
    detail = item.get('detail')
    line = f"- {status:11} {fqdn:24} {best} ({ipv4})"
    if detail:
        line += f" | {detail}"
    print(line)
if data.get('notification_error'):
    print(f"通知异常: {data['notification_error']}")
PY
}

scan_targets() {
  ensure_ready
  if [[ -f "${ENV_FILE}" ]]; then
    export ENV_FILE
  fi
  "${PYTHON_BIN}" - <<'PY' "${TARGETS_CONFIG}" "${QUERY_SCRIPT}"
import json, subprocess, sys
from pathlib import Path
config_path = Path(sys.argv[1])
query_script = sys.argv[2]
config = json.loads(config_path.read_text(encoding='utf-8'))
targets = config.get('targets') or []
results = []
for item in targets:
    ipv4 = item['ipv4'] if isinstance(item, dict) else str(item)
    cp = subprocess.run([sys.executable, query_script, ipv4], text=True, capture_output=True)
    payload = cp.stdout.strip() if cp.stdout.strip() else cp.stderr.strip()
    try:
        parsed = json.loads(payload) if payload else {'query_ipv4': ipv4, 'found': False, 'error': 'empty output'}
    except Exception:
        parsed = {'query_ipv4': ipv4, 'found': False, 'error': payload or f'exit={cp.returncode}'}
    parsed['exit_code'] = cp.returncode
    results.append(parsed)
print(json.dumps({'config': str(config_path), 'results': results}, ensure_ascii=False, indent=2))
PY
}

run_daemon() {
  while true; do
    echo "[$(date '+%F %T')] 执行 DDNS 同步"
    run_sync || true
    sleep "${INTERVAL_SEC}"
  done
}

main() {
  local mode="${1:-all}"
  case "${mode}" in
    ddns|all)
      run_sync
      ;;
    html)
      render_html_summary
      ;;
    scan)
      scan_targets
      ;;
    daemon)
      run_daemon
      ;;
    *)
      echo "用法: bash scripts/aliddns_sync.sh [scan|ddns|all|html|daemon]" >&2
      exit 1
      ;;
  esac
}

main "$@"
