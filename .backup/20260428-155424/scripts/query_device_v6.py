#!/usr/bin/env python3
from __future__ import annotations
import ipaddress
import json
import os
import pty
import re
import select
import subprocess
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = Path(os.environ.get('ENV_FILE') or (BASE_DIR.parent / '.env'))
if not ENV_PATH.exists():
    fallback_env = BASE_DIR / '.env'
    if fallback_env.exists():
        ENV_PATH = fallback_env


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        raise SystemExit(f'.env not found: {path}')
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip()
    return env


def run_router_command(env: dict[str, str], command: str) -> str:
    host = env['ROUTER_HOST']
    user = env.get('ROUTER_USERNAME') or env.get('ROUTER_USER') or 'root'
    password = env.get('ROUTER_PASSWORD') or env.get('ROUTER_PASS')
    if not password:
        raise SystemExit('ROUTER_PASSWORD/ROUTER_PASS missing in .env')

    ssh_cmd = [
        'sshpass', '-p', password,
        'ssh', '-tt',
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-o', 'ConnectTimeout=10',
        f'{user}@{host}',
    ]

    master_fd, slave_fd = pty.openpty()
    proc = subprocess.Popen(
        ssh_cmd,
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        text=False,
        close_fds=True,
    )
    os.close(slave_fd)

    chunks: list[bytes] = []
    deadline = time.time() + 25
    sent_login = False
    sent_password = False
    sent_command = False
    try:
        while time.time() < deadline:
            rlist, _, _ = select.select([master_fd], [], [], 0.5)
            if master_fd in rlist:
                try:
                    data = os.read(master_fd, 65536)
                except OSError:
                    break
                if not data:
                    break
                chunks.append(data)
                text = b''.join(chunks).decode(errors='ignore')
                if not sent_login and 'Login:' in text:
                    os.write(master_fd, f'{user}\n'.encode())
                    sent_login = True
                if not sent_password and 'Password:' in text:
                    os.write(master_fd, f'{password}\n'.encode())
                    sent_password = True
                if not sent_command and 'WAP>' in text:
                    os.write(master_fd, f'{command}\n'.encode())
                    sent_command = True
                elif sent_command and text.count('WAP>') >= 2:
                    os.write(master_fd, b'quit\n')
                    break
            if proc.poll() is not None:
                break
    finally:
        end = time.time() + 5
        while time.time() < end:
            rlist, _, _ = select.select([master_fd], [], [], 0.2)
            if master_fd not in rlist:
                if proc.poll() is not None:
                    break
                continue
            try:
                data = os.read(master_fd, 65536)
            except OSError:
                break
            if not data:
                break
            chunks.append(data)
        try:
            os.close(master_fd)
        except OSError:
            pass
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

    return b''.join(chunks).decode(errors='ignore')


def extract_display_table(text: str) -> str:
    marker = 'display user device'
    idx = text.find(marker)
    if idx == -1:
        raise SystemExit('router output does not contain `display user device` result')
    text = text[idx:]
    total_idx = text.find('Total:')
    if total_idx != -1:
        text = text[:total_idx]
    return text


def parse_rows(table: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    mac_re = re.compile(r'([0-9a-f]{2}(?::[0-9a-f]{2}){5})', re.I)
    ip_re = re.compile(r'((?:\d{1,3}\.){3}\d{1,3}|(?:[0-9a-f]{0,4}:){1,7}[0-9a-f]{0,4})', re.I)
    for raw in table.splitlines():
        line = raw.strip().replace('\r', '')
        if not line or line.startswith('Status Flags') or line.startswith('IPv4 address:') or line.startswith('IPv6 address:'):
            continue
        if set(line) <= {'-'}:
            continue
        mac_match = mac_re.search(line)
        if not mac_match:
            continue
        mac = mac_match.group(1).lower()
        before = line[:mac_match.start()]
        after = line[mac_match.end():].strip()
        intf = after.split()[-1] if after else ''

        ips = []
        for m in ip_re.finditer(before):
            cand = m.group(1)
            try:
                ipaddress.ip_address(cand)
                ips.append(cand)
            except ValueError:
                pass
        if not ips:
            continue
        ip = ips[-1]
        rows.append({'ip': ip, 'mac': mac, 'intf': intf, 'raw': line})
    return rows


def mac_to_eui64_suffix(mac: str) -> str:
    parts = [int(part, 16) for part in mac.split(':')]
    parts[0] ^= 0x02
    eui = parts[:3] + [0xFF, 0xFE] + parts[3:]
    return ':'.join([
        f'{eui[0]:02x}{eui[1]:02x}',
        f'{eui[2]:02x}ff',
        f'fe{eui[3]:02x}',
        f'{eui[4]:02x}{eui[5]:02x}',
    ])


def build_ipv6_usage(rows: list[dict[str, str]]) -> dict[str, set[str]]:
    usage: dict[str, set[str]] = {}
    for row in rows:
        ip = row['ip']
        if ':' not in ip:
            continue
        usage.setdefault(ip.lower(), set()).add(row['mac'])
    return usage


def choose_best_ipv6(v6s: list[str], *, mac: str | None = None, ipv6_usage: dict[str, set[str]] | None = None) -> str | None:
    if not v6s:
        return None
    globals_ = [ip for ip in v6s if not ip.lower().startswith('fe80:')]
    if not globals_:
        return v6s[0]

    eui64_suffix = mac_to_eui64_suffix(mac) if mac else None

    def score(ip: str) -> tuple[int, int, int, int, int]:
        ip_lower = ip.lower()
        shared_by_multiple_macs = 1
        if ipv6_usage is not None:
            shared_by_multiple_macs = 1 if len(ipv6_usage.get(ip_lower, set())) > 1 else 0
        eui64_match = 0 if eui64_suffix and ip_lower.endswith(eui64_suffix) else 1
        short_manual_hint = 0 if re.search(r'::[0-9a-f]{1,4}$', ip_lower) else 1
        privacy_hint = 1 if len(ip.split(':')[-1]) >= 4 and 'ff:fe' not in ip_lower else 0
        return (shared_by_multiple_macs, eui64_match, short_manual_hint, privacy_hint, len(ip))

    return sorted(globals_, key=score)[0]


def main() -> int:
    if len(sys.argv) != 2:
        print('Usage: python3 query_device_v6.py <IPv4>')
        return 1
    target_ipv4 = sys.argv[1].strip()
    env = load_env(ENV_PATH)
    raw = run_router_command(env, 'display user device')
    table = extract_display_table(raw)
    rows = parse_rows(table)

    by_ip = {row['ip']: row for row in rows if '.' in row['ip']}
    ipv6_usage = build_ipv6_usage(rows)
    hit = by_ip.get(target_ipv4)
    if not hit:
        print(json.dumps({'query_ipv4': target_ipv4, 'found': False}, ensure_ascii=False, indent=2))
        return 2

    mac = hit['mac']
    ipv6_list = sorted({row['ip'] for row in rows if row['mac'] == mac and ':' in row['ip']}, key=lambda x: (x.lower().startswith('fe80:'), len(x), x))
    result = {
        'query_ipv4': target_ipv4,
        'found': True,
        'mac': mac,
        'interface': hit['intf'],
        'best_ipv6': choose_best_ipv6(ipv6_list, mac=mac, ipv6_usage=ipv6_usage),
        'all_ipv6': ipv6_list,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
