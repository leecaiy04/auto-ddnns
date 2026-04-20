#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from query_device_v6 import (
    ENV_PATH as ROUTER_ENV_PATH,
    build_ipv6_usage,
    choose_best_ipv6,
    extract_display_table,
    load_env,
    parse_rows,
    run_router_command,
)

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
ENV_PATH = Path(os.environ.get('ENV_FILE') or (PROJECT_ROOT / '.env'))
if not ENV_PATH.exists():
    fallback_env = BASE_DIR / '.env'
    if fallback_env.exists():
        ENV_PATH = fallback_env
CONFIG_PATH = Path(os.environ.get('DDNS_TARGETS_CONFIG') or (PROJECT_ROOT / 'config' / 'private_ipv6_ddns_targets.json'))
DEFAULT_IPS = ['192.168.3.2', '192.168.3.10', '192.168.3.200', '192.168.3.201']
MESSAGE_CENTER_DIR = Path(os.environ.get('MESSAGE_CENTER_DIR', '/home/leecaiy/workspace/feishu-message-center'))
MESSAGE_CLIENT = Path(os.environ.get('MESSAGE_CLIENT_PATH', str(MESSAGE_CENTER_DIR / 'machine_client.py')))
NOTIFY_MACHINE_ID = os.environ.get('NOTIFY_MACHINE_ID', 'debian')
ALIYUN_ENDPOINT = 'https://alidns.aliyuncs.com/'


@dataclass
class HostPlan:
    ipv4: str
    rr: str
    fqdn: str


@dataclass
class SyncResult:
    ipv4: str
    fqdn: str
    status: str
    best_ipv6: str | None = None
    record_id: str | None = None
    previous_value: str | None = None
    detail: str | None = None


# 阿里云 RPC API 要求的特殊百分号编码规则。
def percent_encode(value: Any) -> str:
    return urllib.parse.quote(str(value), safe='~').replace('+', '%20').replace('*', '%2A')


class AliyunDnsClient:
    def __init__(self, access_key_id: str, access_key_secret: str, endpoint: str = ALIYUN_ENDPOINT) -> None:
        self.access_key_id = access_key_id
        self.access_key_secret = access_key_secret
        self.endpoint = endpoint.rstrip('/') + '/'

    def _signed_params(self, action: str, extra: dict[str, Any]) -> dict[str, Any]:
        params: dict[str, Any] = {
            'Action': action,
            'Format': 'JSON',
            'Version': '2015-01-09',
            'AccessKeyId': self.access_key_id,
            'SignatureMethod': 'HMAC-SHA1',
            'Timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'SignatureVersion': '1.0',
            'SignatureNonce': uuid.uuid4().hex,
        }
        params.update(extra)
        canonicalized = '&'.join(
            f'{percent_encode(key)}={percent_encode(params[key])}' for key in sorted(params)
        )
        string_to_sign = f'GET&%2F&{percent_encode(canonicalized)}'
        digest = hmac.new(
            f'{self.access_key_secret}&'.encode('utf-8'),
            string_to_sign.encode('utf-8'),
            hashlib.sha1,
        ).digest()
        params['Signature'] = base64.b64encode(digest).decode('utf-8')
        return params

    def request(self, action: str, **extra: Any) -> dict[str, Any]:
        params = self._signed_params(action, extra)
        url = f'{self.endpoint}?{urllib.parse.urlencode(params)}'
        req = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = resp.read().decode('utf-8')
        data = json.loads(payload)
        if 'Code' in data and 'RequestId' in data:
            raise RuntimeError(f"Aliyun API error {data['Code']}: {data.get('Message', '')}")
        return data

    def describe_subdomain_records(self, subdomain: str, record_type: str = 'AAAA') -> list[dict[str, Any]]:
        data = self.request(
            'DescribeSubDomainRecords',
            SubDomain=subdomain,
            Type=record_type,
            PageSize=100,
            PageNumber=1,
        )
        return data.get('DomainRecords', {}).get('Record', []) or []

    def add_domain_record(self, domain_name: str, rr: str, value: str, record_type: str = 'AAAA', ttl: int = 600) -> str:
        data = self.request(
            'AddDomainRecord',
            DomainName=domain_name,
            RR=rr,
            Type=record_type,
            Value=value,
            TTL=ttl,
        )
        return str(data['RecordId'])

    def update_domain_record(self, record_id: str, rr: str, value: str, record_type: str = 'AAAA', ttl: int = 600) -> str:
        data = self.request(
            'UpdateDomainRecord',
            RecordId=record_id,
            RR=rr,
            Type=record_type,
            Value=value,
            TTL=ttl,
        )
        return str(data['RecordId'])

    def delete_domain_record(self, record_id: str) -> str:
        data = self.request('DeleteDomainRecord', RecordId=record_id)
        return str(data['RecordId'])


# 一次抓取路由器邻居表，再批量映射所有目标设备，避免重复 SSH。
def collect_router_snapshot(env: dict[str, str]) -> dict[str, dict[str, Any]]:
    raw = run_router_command(env, 'display user device')
    table = extract_display_table(raw)
    rows = parse_rows(table)
    by_ip = {row['ip']: row for row in rows if '.' in row['ip']}
    by_mac_ipv6: dict[str, list[str]] = {}
    ipv6_usage = build_ipv6_usage(rows)
    for row in rows:
        ip = row['ip']
        if ':' not in ip:
            continue
        by_mac_ipv6.setdefault(row['mac'], []).append(ip)

    snapshot: dict[str, dict[str, Any]] = {}
    for ipv4, row in by_ip.items():
        v6s = sorted(
            set(by_mac_ipv6.get(row['mac'], [])),
            key=lambda x: (x.lower().startswith('fe80:'), len(x), x),
        )
        snapshot[ipv4] = {
            'mac': row['mac'],
            'interface': row['intf'],
            'all_ipv6': v6s,
            'best_ipv6': choose_best_ipv6(v6s, mac=row['mac'], ipv6_usage=ipv6_usage),
        }
    return snapshot


def build_host_plans(ips: list[str], domain: str, suffix: str) -> list[HostPlan]:
    plans: list[HostPlan] = []
    for ip in ips:
        octet = ip.strip().split('.')[-1]
        rr = f'{octet}.{suffix}' if suffix else octet
        plans.append(HostPlan(ipv4=ip, rr=rr, fqdn=f'{rr}.{domain}'))
    return plans


def load_json_config(config_path: Path) -> dict[str, Any]:
    if not config_path.exists():
        return {}
    with config_path.open('r', encoding='utf-8') as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise SystemExit(f'配置文件格式错误，顶层必须是对象: {config_path}')
    return data


def normalize_ips(raw_targets: Any) -> list[str]:
    if raw_targets is None:
        return []
    if not isinstance(raw_targets, list):
        raise SystemExit('配置文件中的 targets 必须是数组')

    ips: list[str] = []
    for item in raw_targets:
        if isinstance(item, str):
            ip = item.strip()
        elif isinstance(item, dict):
            ip = str(item.get('ipv4') or '').strip()
        else:
            raise SystemExit('配置文件中的 targets 项必须是字符串或包含 ipv4 的对象')
        if not ip:
            raise SystemExit('配置文件中的 targets 项缺少 ipv4')
        ips.append(ip)
    return ips


def resolve_runtime_settings(args: argparse.Namespace, env: dict[str, str]) -> tuple[str, str, int, bool, list[str]]:
    config = load_json_config(Path(args.config))
    domain = (args.domain or config.get('domain') or env.get('ALIYUN_DOMAIN') or env.get('DOMAIN') or '').strip()
    if not domain:
        raise SystemExit('缺少域名，请在配置文件或 .env 中设置 domain / ALIYUN_DOMAIN / DOMAIN，或通过 --domain 传入')

    suffix = str(args.suffix if args.suffix is not None else config.get('suffix', 'v6')).strip()
    if not suffix:
        suffix = ''

    ttl = args.ttl if args.ttl is not None else int(config.get('ttl', 600))
    notify = bool(args.notify or config.get('notify', False))

    if args.ips:
        ips = args.ips
    else:
        ips = normalize_ips(config.get('targets')) or DEFAULT_IPS

    return domain, suffix, ttl, notify, ips


def sync_one(client: AliyunDnsClient, plan: HostPlan, best_ipv6: str | None, domain: str, ttl: int) -> SyncResult:
    if not best_ipv6:
        return SyncResult(
            ipv4=plan.ipv4,
            fqdn=plan.fqdn,
            status='missing_ipv6',
            detail='路由器邻居表里没有可用的全局 IPv6，已跳过',
        )

    records = client.describe_subdomain_records(plan.fqdn, record_type='AAAA')
    if not records:
        record_id = client.add_domain_record(domain, plan.rr, best_ipv6, ttl=ttl)
        return SyncResult(
            ipv4=plan.ipv4,
            fqdn=plan.fqdn,
            status='added',
            best_ipv6=best_ipv6,
            record_id=record_id,
        )

    # 只保留一条 AAAA 记录：主记录更新为目标值，多余记录删除，避免重复解析。
    records = sorted(records, key=lambda item: int(item.get('RecordId', 0)))
    primary = records[0]
    current_value = str(primary.get('Value') or '')
    record_id = str(primary.get('RecordId'))
    extras = records[1:]

    changed = False
    detail_parts: list[str] = []
    if current_value != best_ipv6:
        client.update_domain_record(record_id, plan.rr, best_ipv6, ttl=ttl)
        changed = True
        detail_parts.append(f'{current_value or "<empty>"} -> {best_ipv6}')

    if extras:
        extra_ids = []
        for extra in extras:
            extra_id = str(extra.get('RecordId'))
            client.delete_domain_record(extra_id)
            extra_ids.append(extra_id)
        changed = True
        detail_parts.append(f'清理重复记录 {", ".join(extra_ids)}')

    if changed:
        return SyncResult(
            ipv4=plan.ipv4,
            fqdn=plan.fqdn,
            status='updated',
            best_ipv6=best_ipv6,
            record_id=record_id,
            previous_value=current_value,
            detail='；'.join(detail_parts),
        )

    return SyncResult(
        ipv4=plan.ipv4,
        fqdn=plan.fqdn,
        status='unchanged',
        best_ipv6=best_ipv6,
        record_id=record_id,
        previous_value=current_value,
    )


def send_notification(message: str) -> None:
    if not MESSAGE_CLIENT.exists():
        raise RuntimeError(f'未找到消息中心客户端: {MESSAGE_CLIENT}')
    cmd = [sys.executable, str(MESSAGE_CLIENT), 'send', '--machine-id', NOTIFY_MACHINE_ID, message]
    cp = subprocess.run(cmd, cwd=MESSAGE_CENTER_DIR, text=True, capture_output=True)
    if cp.returncode != 0:
        raise RuntimeError(cp.stderr.strip() or cp.stdout.strip() or 'machine_client send failed')


# 只有本轮确实新增/更新了 DNS 记录，才发群消息。
def maybe_notify(domain: str, results: list[SyncResult]) -> None:
    changed = [item for item in results if item.status in {'added', 'updated'}]
    if not changed:
        return
    lines = [f'[DDNS] {domain} IPv6 记录已更新，共 {len(changed)} 项：']
    for item in changed:
        action = '新增' if item.status == 'added' else '更新'
        lines.append(f'- {action} {item.fqdn} <= {item.best_ipv6} (内网 {item.ipv4})')
        if item.detail:
            lines.append(f'  说明：{item.detail}')
    missing = [item for item in results if item.status == 'missing_ipv6']
    for item in missing:
        lines.append(f'- 跳过 {item.fqdn}：{item.detail} (内网 {item.ipv4})')
    send_notification('\n'.join(lines))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='按内网 IPv4 查询 IPv6 并同步到阿里云 AAAA 记录')
    parser.add_argument('--config', default=str(CONFIG_PATH), help='JSON 配置文件路径')
    parser.add_argument('--ips', nargs='*', default=None, help='需要同步的内网 IPv4 列表；传入后优先级高于配置文件')
    parser.add_argument('--domain', default=None, help='根域名；优先级高于配置文件和 .env')
    parser.add_argument('--suffix', default=None, help='子域前缀后缀，例如 v6；为空字符串时可省略该层')
    parser.add_argument('--ttl', type=int, default=None, help='阿里云记录 TTL；优先级高于配置文件')
    parser.add_argument('--notify', action='store_true', help='有新增/更新时发送飞书通知；未传时可由配置文件控制')
    parser.add_argument('--json', action='store_true', help='只输出 JSON 结果，便于脚本集成')
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    env = load_env(ENV_PATH if ENV_PATH.exists() else ROUTER_ENV_PATH)
    domain, suffix, ttl, notify, ips = resolve_runtime_settings(args, env)

    access_key_id = (env.get('ALIYUN_AK') or '').strip()
    access_key_secret = (env.get('ALIYUN_SK') or '').strip()
    if not access_key_id or not access_key_secret:
        raise SystemExit('缺少 ALIYUN_AK / ALIYUN_SK，无法调用阿里云 DNS API')

    plans = build_host_plans(ips, domain, suffix)
    snapshot = collect_router_snapshot(env)
    client = AliyunDnsClient(access_key_id, access_key_secret)

    results: list[SyncResult] = []
    for plan in plans:
        best_ipv6 = (snapshot.get(plan.ipv4) or {}).get('best_ipv6')
        result = sync_one(client, plan, best_ipv6, domain, ttl)
        results.append(result)

    notification_error = None
    if notify:
        try:
            maybe_notify(domain, results)
        except Exception as exc:
            notification_error = str(exc)

    payload = {
        'config': str(Path(args.config)),
        'domain': domain,
        'suffix': suffix,
        'ttl': ttl,
        'notify': notify,
        'ips': ips,
        'results': [result.__dict__ for result in results],
        'notification_error': notification_error,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for item in results:
            detail = f' | {item.detail}' if item.detail else ''
            print(f'{item.status:<11} {item.fqdn:<24} {item.best_ipv6 or "-"} ({item.ipv4}){detail}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
