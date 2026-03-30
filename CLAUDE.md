# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an integrated automation toolkit for DDNS, Lucky reverse proxy management, router administration, and SunPanel dashboard management. The project uses a centralized hub architecture to coordinate multiple services.

## Architecture

```
central-hub/          # Central coordination service (Express API on :3000)
├── modules/          # Core modules: router-monitor, ddns-controller, lucky-sync, sunpanel-manager
├── routes/           # RESTful API endpoints
└── server.mjs        # Main entry point

dns-publishing/       # DDNS automation (Aliyun DNS API)
├── aliddns_sync.sh   # Core script for network scanning and DNS updates
├── ddns_daemon.sh    # Daemon management
└── node_modules/puppeteer-core

lucky-management/     # Lucky reverse proxy management
├── src/
│   ├── lucky-api.mjs           # API client with OpenToken auth
│   └── lucky-port-manager.mjs  # High-level port management tools
└── docs/                       # Complete API documentation

sunpanel-management/ # SunPanel dashboard automation
└── src/sunpanel-api.mjs        # API client for managing cards/groups

router-management/    # Router SSH and network scanning
├── ssh-config/      # SSH connection configurations
└── scan-results/    # Network scan results

scripts/             # Synchronization scripts
└── sync-lucky-to-sunpanel.mjs  # Syncs Lucky proxies to SunPanel cards
```

## Configuration

**Critical**: All services use `.env` file for sensitive configuration. Priority: `.env` > JSON config > defaults.

```bash
# Initial setup
cp .env.template .env
chmod 600 .env
# Edit .env with your tokens
```

Required environment variables:
- `SUNPANEL_API_TOKEN` - SunPanel API token
- `LUCKY_OPEN_TOKEN` - Lucky OpenToken for authentication
- `SUNPANEL_API_BASE` - Default: `http://192.168.3.200:20001/openapi/v1`
- `LUCKY_API_BASE` - Default: `http://192.168.3.200:16601`

## Common Commands

### Central Hub (中枢服务)
```bash
cd central-hub
npm install
npm start          # Production
npm run dev        # Development with --watch

# Test API
curl http://localhost:3000/api/health
curl http://localhost:3000/api/status
curl -X POST http://localhost:3000/api/ddns/refresh
```

### DDNS Service
```bash
cd dns-publishing
./ddns_daemon.sh start      # Start daemon and web service
./ddns_daemon.sh stop
./ddns_daemon.sh status
./ddns_daemon.sh logs web   # View web service logs
./ddns_daemon.sh logs daemon

# Manual DDNS update
bash aliddns_sync.sh all    # Scan + update + generate HTML
```

### Lucky Management
```bash
cd lucky-management
node src/test-all-opentoken.mjs  # Test connection
node github-manager.mjs           # Manage proxy configs
```

### SunPanel Management
```bash
cd sunpanel-management
node src/sunpanel-api.mjs test    # Test connection
node src/sunpanel-api.mjs groups  # List all groups
```

### Sync Scripts
```bash
# Sync Lucky proxies to SunPanel cards
node scripts/sync-lucky-to-sunpanel.mjs --status
node scripts/sync-lucky-to-sunpanel.mjs --dry-run
node scripts/sync-lucky-to-sunpanel.mjs --execute
```

## Key Technical Details

### Module System (ES Modules)
All Node.js files use `.mjs` extension and ES module syntax (`import`/`export`). Node.js 18+ required.

### DDNS Workflow
1. Ping devices to populate ARP table
2. SSH to router (192.168.3.1) to get neighbor table
3. Extract IPv4 → IPv6 mappings via MAC addresses
4. Update Aliyun DNS AAAA records (format: `{last_octet}.v6.leecaiy.xyz`)
5. Generate HTML status page on port 20000

### Lucky API Authentication
Uses OpenToken via URL parameter: `?openToken=YOUR_TOKEN`. Never commit tokens to git.

### State Persistence
Central Hub maintains state in `data/central-hub-state.json` with backup history.

### systemd Integration
Services can be installed as systemd units for auto-start on boot.

## Testing Connections

```bash
# SunPanel
node sunpanel-management/src/sunpanel-api.mjs test

# Lucky
node lucky-management/src/test-all-opentoken.mjs

# Central Hub API
curl http://localhost:3000/api/health
```

## Important Paths

- Aliyun DDNS script: `/home/leecaiy/ddns_work/update_all_ddns.sh`
- State file: `central-hub/data/central-hub-state.json`
- Logs: `central-hub/logs/`, `dns-publishing/logs/`
- Config templates: `central-hub/config/`

## Security Notes

- `.env` file must have 600 permissions
- Never commit `.env`, API tokens, or OpenTokens
- Router SSH credentials stored in scripts - handle with care
- Central Hub binds to `0.0.0.0:3000` - use firewall in production
