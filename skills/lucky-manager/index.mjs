/**
 * Lucky Manager Skill
 * 提供 Lucky 反向代理管理功能
 */

import LuckyDDNS from '../../modules/lucky-manager/lucky-ddns.mjs';
import LuckyPortManager from '../../modules/lucky-manager/lucky-port-manager.mjs';
import LuckySSL from '../../modules/lucky-manager/lucky-ssl.mjs';
import { syncProxyRulesToSunPanel } from '../../modules/sunpanel-sync/sunpanel-sync.mjs';
import { loadConfig } from '../../modules/config-loader/config-loader.mjs';

export default class LuckyManagerSkill {
  constructor(config = {}) {
    this.config = config;
    this.ddns = null;
    this.portManager = null;
    this.ssl = null;
  }

  /**
   * 初始化模块
   */
  async initialize() {
    if (!this.ddns) {
      const config = await loadConfig();
      this.ddns = new LuckyDDNS(config);
      this.portManager = new LuckyPortManager(config);
      this.ssl = new LuckySSL(config);
    }
  }

  /**
   * 执行 skill 操作
   */
  async execute(action, params = {}, context = {}) {
    await this.initialize();

    switch (action) {
      case 'manageDDNS':
        return await this.manageDDNS(params);
      case 'managePort':
        return await this.managePort(params);
      case 'manageSSL':
        return await this.manageSSL(params);
      case 'syncToSunPanel':
        return await this.syncToSunPanel(params);
      case 'getStatus':
        return await this.getStatus();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * 管理 DDNS 任务
   */
  async manageDDNS(params) {
    const { action, taskId, config } = params;

    switch (action) {
      case 'list':
        return await this.ddns.listTasks();
      case 'create':
        if (!config) throw new Error('config is required for create action');
        return await this.ddns.createTask(config);
      case 'update':
        if (!taskId || !config) throw new Error('taskId and config are required for update action');
        return await this.ddns.updateTask(taskId, config);
      case 'delete':
        if (!taskId) throw new Error('taskId is required for delete action');
        return await this.ddns.deleteTask(taskId);
      default:
        throw new Error(`Unknown DDNS action: ${action}`);
    }
  }

  /**
   * 管理端口监听和反向代理
   */
  async managePort(params) {
    const { action, port, proxyConfig } = params;

    switch (action) {
      case 'list':
        return await this.portManager.listPorts();
      case 'create':
        if (!port) throw new Error('port is required for create action');
        return await this.portManager.createPort(port, proxyConfig);
      case 'update':
        if (!port || !proxyConfig) throw new Error('port and proxyConfig are required for update action');
        return await this.portManager.updatePort(port, proxyConfig);
      case 'delete':
        if (!port) throw new Error('port is required for delete action');
        return await this.portManager.deletePort(port);
      case 'add-proxy':
        if (!port || !proxyConfig) throw new Error('port and proxyConfig are required for add-proxy action');
        return await this.portManager.addProxyRule(port, proxyConfig);
      case 'remove-proxy':
        if (!port || !proxyConfig?.name) throw new Error('port and proxyConfig.name are required for remove-proxy action');
        return await this.portManager.removeProxyRule(port, proxyConfig.name);
      default:
        throw new Error(`Unknown port action: ${action}`);
    }
  }

  /**
   * 管理 SSL 证书
   */
  async manageSSL(params) {
    const { action, certKey, certConfig } = params;

    switch (action) {
      case 'list':
        return await this.ssl.listCertificates();
      case 'apply':
        if (!certConfig) throw new Error('certConfig is required for apply action');
        return await this.ssl.applyCertificate(certConfig);
      case 'delete':
        if (!certKey) throw new Error('certKey is required for delete action');
        return await this.ssl.deleteCertificate(certKey);
      case 'get-detail':
        if (!certKey) throw new Error('certKey is required for get-detail action');
        return await this.ssl.getCertificateDetail(certKey);
      default:
        throw new Error(`Unknown SSL action: ${action}`);
    }
  }

  /**
   * 同步到 SunPanel
   */
  async syncToSunPanel(params) {
    const { port } = params;
    const config = await loadConfig();

    if (port) {
      // 同步指定端口
      const portInfo = await this.portManager.getPort(port);
      if (!portInfo) {
        throw new Error(`Port ${port} not found`);
      }
      return await syncProxyRulesToSunPanel([portInfo], config);
    } else {
      // 同步所有端口
      const ports = await this.portManager.listPorts();
      return await syncProxyRulesToSunPanel(ports, config);
    }
  }

  /**
   * 获取 Lucky 服务状态
   */
  async getStatus() {
    try {
      const [ddnsTasks, ports, certificates] = await Promise.all([
        this.ddns.listTasks(),
        this.portManager.listPorts(),
        this.ssl.listCertificates()
      ]);

      return {
        status: 'online',
        ddns: {
          total: ddnsTasks.length,
          tasks: ddnsTasks
        },
        ports: {
          total: ports.length,
          list: ports
        },
        ssl: {
          total: certificates.length,
          certificates: certificates
        }
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * 获取 skill 能力列表
   */
  getCapabilities() {
    return [
      'manageDDNS',
      'managePort',
      'manageSSL',
      'syncToSunPanel',
      'getStatus'
    ];
  }

  /**
   * 验证参数
   */
  validate(params) {
    if (!params.action) {
      return { valid: false, error: 'action is required' };
    }
    return { valid: true };
  }
}
