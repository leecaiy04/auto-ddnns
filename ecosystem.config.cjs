module.exports = {
  apps: [{
    name: 'auto-ddnns',
    script: './central-hub/server.mjs',
    cwd: '/vol1/1000/code/auto-ddnns',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      // 路由器配置
      ROUTER_HOST: process.env.ROUTER_HOST || '192.168.9.1',
      ROUTER_USERNAME: process.env.ROUTER_USERNAME,
      ROUTER_PASSWORD: process.env.ROUTER_PASSWORD,
      ROUTER_TYPE: process.env.ROUTER_TYPE || 'ikuai',
      ROUTER_SSL_VERIFY: process.env.ROUTER_SSL_VERIFY || '0',
      // 阿里云 DDNS
      ALIYUN_AK: process.env.ALIYUN_AK,
      ALIYUN_SK: process.env.ALIYUN_SK,
      ALIYUN_DOMAIN: process.env.ALIYUN_DOMAIN || 'leecaiy.shop',
      // Lucky
      LUCKY_OPEN_TOKEN: process.env.LUCKY_OPEN_TOKEN,
      LUCKY_API_BASE: process.env.LUCKY_API_BASE || 'http://192.168.9.2:16601/666',
      LUCKY_HTTPS_PORT: process.env.LUCKY_HTTPS_PORT || '55000',
      LUCKY_USERNAME: process.env.LUCKY_USERNAME,
      LUCKY_PASSWORD: process.env.LUCKY_PASSWORD,
      // SunPanel
      SUNPANEL_API_BASE: process.env.SUNPANEL_API_BASE || 'http://192.168.9.2:20001/openapi/v1',
      SUNPANEL_API_TOKEN: process.env.SUNPANEL_API_TOKEN,
      SUNPANEL_USERNAME: process.env.SUNPANEL_USERNAME,
      SUNPANEL_PASSWORD: process.env.SUNPANEL_PASSWORD,
      // Central Hub
      HUB_PORT: process.env.HUB_PORT || '51000',
      HUB_HOST: process.env.HUB_HOST || '0.0.0.0',
      // DDNS
      DDNS_SCRIPT_PATH: process.env.DDNS_SCRIPT_PATH || './scripts/aliddns_sync.sh',
      DDNS_UPDATE_INTERVAL: process.env.DDNS_UPDATE_INTERVAL || '600',
      // Cloudflare
      CF_API_TOKEN: process.env.CF_API_TOKEN,
      CF_ZONE_ID: process.env.CF_ZONE_ID,
      CF_DOMAIN: process.env.CF_DOMAIN || 'leecaiy.online',
      // 日志
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      DDNS_TARGETS_CONFIG: process.env.DDNS_TARGETS_CONFIG || './config/private_ipv6_ddns_targets.json',
      // 直接查询设备
      DIRECT_QUERY_DEVICES: process.env.DIRECT_QUERY_DEVICES
    }
  }]
};
