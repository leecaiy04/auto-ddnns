import crypto from 'crypto';
import https from 'https';
import http from 'http';

/**
 * iKuai Router API Client
 * Implements device monitoring via iKuai HTTP API
 */
export class IKuaiClient {
  constructor(config) {
    this.baseUrl = this.normalizeBaseUrl(config.host);
    this.username = config.username;
    this.password = config.password;
    this.sslVerify = config.sslVerify !== false;
    this.session = null;
    this.cookies = [];
  }

  normalizeBaseUrl(host) {
    let url = host.trim();
    if (!url.includes('://')) {
      url = `https://${url}`;
    }
    return url.replace(/\/$/, '');
  }

  /**
   * Login to iKuai router and establish session
   */
  async login() {
    const passwdMd5 = crypto.createHash('md5').update(this.password).digest('hex');
    const passBase64 = Buffer.from(this.password).toString('base64');

    const payload = {
      username: this.username,
      passwd: passwdMd5,
      pass: passBase64,
      remember_password: ''
    };

    const response = await this.request('/Action/login', payload);

    if (response.Result !== 10000) {
      const errMsg = response.ErrMsg || JSON.stringify(response);
      throw new Error(`iKuai login failed: ${errMsg}`);
    }

    return response;
  }

  /**
   * Call iKuai API function
   */
  async call(funcName, action, param) {
    const payload = {
      func_name: funcName,
      action: action,
      param: param
    };

    const response = await this.request('/Action/call', payload);

    if (response.Result !== 30000) {
      const errMsg = response.ErrMsg || JSON.stringify(response);
      throw new Error(`iKuai call failed for ${funcName}.${action}: ${errMsg}`);
    }

    return response.Data || {};
  }

  /**
   * Make HTTP request to iKuai router
   */
  async request(path, payload) {
    const url = new URL(this.baseUrl + path);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': this.cookies.join('; ')
      },
      timeout: 15000
    };

    if (!this.sslVerify) {
      options.agent = new https.Agent({ rejectUnauthorized: false });
    }

    return new Promise((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;

      const req = client.request(url, options, (res) => {
        // Store cookies from response
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          this.cookies = setCookie.map(cookie => cookie.split(';')[0]);
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (err) {
            reject(new Error(`Failed to parse response: ${err.message}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  /**
   * Get IPv4 device list from monitor_lanip
   */
  async getIPv4Devices() {
    const data = await this.call('monitor_lanip', 'show', {
      TYPE: 'data,total',
      ORDER_BY: 'ip_addr_int',
      orderType: 'IP',
      limit: '0,200',
      ORDER: ''
    });

    return this.normalizeDevices(data.data || []);
  }

  /**
   * Get IPv6 device list from monitor_lanipv6
   */
  async getIPv6Devices() {
    const data = await this.call('monitor_lanipv6', 'show', {
      TYPE: 'data,total',
      ORDER_BY: 'ip_addr',
      orderType: 'IP',
      limit: '0,200',
      ORDER: ''
    });

    return this.normalizeDevices(data.data || []);
  }

  /**
   * Normalize device data to standard format
   */
  normalizeDevices(devices) {
    return devices
      .map(item => {
        const ip = String(item.ip_addr || '').trim();
        const mac = String(item.mac || '').trim().toLowerCase();
        if (!ip || !mac) return null;

        const intf = String(item.link_addr || item.apname || item.ssid || '').trim();

        return {
          ip,
          mac: this.normalizeMAC(mac),
          interface: intf,
          hostname: String(item.hostname || '').trim()
        };
      })
      .filter(Boolean);
  }

  /**
   * Normalize MAC address to standard format (lowercase with colons)
   */
  normalizeMAC(mac) {
    // Remove any separators and convert to lowercase
    const cleaned = mac.replace(/[:-]/g, '').toLowerCase();

    // Add colons every 2 characters
    return cleaned.match(/.{1,2}/g)?.join(':') || mac;
  }

  /**
   * Build device address map (MAC -> {ipv4, ipv6[]})
   */
  async buildDeviceAddressMap() {
    await this.login();

    const [ipv4Devices, ipv6Devices] = await Promise.all([
      this.getIPv4Devices(),
      this.getIPv6Devices()
    ]);

    const deviceMap = new Map();

    // Process IPv4 devices
    for (const device of ipv4Devices) {
      if (!deviceMap.has(device.mac)) {
        deviceMap.set(device.mac, {
          mac: device.mac,
          ipv4: device.ip,
          ipv6: [],
          interface: device.interface,
          hostname: device.hostname
        });
      } else {
        const existing = deviceMap.get(device.mac);
        existing.ipv4 = device.ip;
        if (device.interface) existing.interface = device.interface;
        if (device.hostname) existing.hostname = device.hostname;
      }
    }

    // Process IPv6 devices
    for (const device of ipv6Devices) {
      if (!deviceMap.has(device.mac)) {
        deviceMap.set(device.mac, {
          mac: device.mac,
          ipv4: null,
          ipv6: [device.ip],
          interface: device.interface,
          hostname: device.hostname
        });
      } else {
        const existing = deviceMap.get(device.mac);
        if (!existing.ipv6.includes(device.ip)) {
          existing.ipv6.push(device.ip);
        }
        if (device.interface) existing.interface = device.interface;
        if (device.hostname) existing.hostname = device.hostname;
      }
    }

    return deviceMap;
  }
}

/**
 * Create iKuai client from environment config
 */
export function createIKuaiClient(config) {
  return new IKuaiClient({
    host: config.host,
    username: config.username,
    password: config.password,
    sslVerify: config.sslVerify
  });
}
