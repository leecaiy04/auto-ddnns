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
      SUNPANEL_API_BASE: 'http://192.168.3.2:20001/openapi/v1',
      SUNPANEL_API_TOKEN: 'uzeh61a6ldpqggsn8xji8wvhkmft99iv'
    }
  }]
};
