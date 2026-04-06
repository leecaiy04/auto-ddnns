#!/usr/bin/env node
/**
 * DDNS 控制器模块
 * 触发和管理 DDNS 更新
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, '..', '..');
const WINDOWS_BASH_CANDIDATES = [
  process.env.GIT_BASH_PATH,
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe'
].filter(Boolean);

function resolveScriptPath(scriptPath) {
  return path.isAbsolute(scriptPath)
    ? scriptPath
    : path.resolve(PROJECT_ROOT, scriptPath);
}

function buildLanDevicesCacheLines(stateManager) {
  const devices = stateManager?.state?.devices?.devices || {};

  return Object.values(devices)
    .filter(device => device?.ipv4 && device?.ipv6)
    .map(device => `${device.mac || ''}|${device.ipv4}|${device.ipv6}|`);
}

function resolveBashCommand() {
  if (process.platform !== 'win32') {
    return 'bash';
  }

  const gitBash = WINDOWS_BASH_CANDIDATES.find(candidate => fs.existsSync(candidate));
  if (!gitBash) {
    throw new Error('Windows 环境未找到可用的 Bash，请安装 Git for Windows 或设置 GIT_BASH_PATH');
  }

  return gitBash;
}

function buildIpv6Hostname(ipv4, domain) {
  const lastOctet = `${ipv4 || ''}`.trim().split('.').pop();
  if (!lastOctet || !/^\d+$/.test(lastOctet) || !domain) {
    return null;
  }

  return `${lastOctet}.v6.${domain}`;
}

function buildIpv4Hostname(ipv4, domain) {
  const lastOctet = `${ipv4 || ''}`.trim().split('.').pop();
  if (!lastOctet || !/^\d+$/.test(lastOctet) || !domain) {
    return null;
  }

  return `${lastOctet}.${domain}`;
}

function extractPublicIp(output = '') {
  const matches = `${output}`.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
  return matches?.[0] || null;
}

function normalizeDomains(value) {
  return `${value || ''}`
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractTaggedJsonLines(output = '', tag) {
  const prefix = `__${tag}__`;
  return `${output}`
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith(prefix))
    .map(line => safeJsonParse(line.slice(prefix.length)))
    .filter(Boolean);
}

function createFamilySummary(summary = {}) {
  const total = Number(summary.total ?? 0);
  const success = Number(summary.success ?? 0);
  const failure = Number(summary.failure ?? 0);
  const skipped = Number(summary.skipped ?? 0);
  const added = Number(summary.added ?? 0);
  const updated = Number(summary.updated ?? 0);

  return {
    total,
    success,
    failure,
    skipped,
    added,
    updated
  };
}

function buildSummaryFromHosts(hosts = [], family) {
  const records = hosts
    .map(host => host?.[family])
    .filter(Boolean);

  return createFamilySummary({
    total: records.length,
    success: records.filter(item => item.success !== false).length,
    failure: records.filter(item => item.success === false).length,
    skipped: records.filter(item => item.action === 'skip').length,
    added: records.filter(item => item.action === 'add').length,
    updated: records.filter(item => item.action === 'update').length
  });
}

function aggregateHostResults(hostEntries = []) {
  const hostMap = new Map();

  for (const item of hostEntries) {
    const key = item.host || item.fqdn || item.hostname;
    if (!key) continue;

    const existing = hostMap.get(key) || {
      host: key,
      hostname: item.hostname || item.fqdn || null,
      ipv4: null,
      ipv6: null,
      published: false,
      publishStatus: 'missing',
      publishMessage: null,
      success: false,
      ok: false
    };

    const familyPayload = {
      family: item.family || null,
      type: item.type || null,
      rr: item.rr || null,
      fqdn: item.fqdn || item.hostname || null,
      hostname: item.hostname || item.fqdn || null,
      value: item.value || null,
      ipv4: item.ipv4 || null,
      ipv6: item.ipv6 || null,
      action: item.action || null,
      success: item.success !== false,
      recordId: item.recordId || null,
      message: item.message || null
    };

    if (item.family === 'ipv4') {
      existing.ipv4 = familyPayload;
    } else {
      existing.ipv6 = familyPayload;
      if (familyPayload.hostname) {
        existing.hostname = familyPayload.hostname;
      }
    }

    const records = [existing.ipv4, existing.ipv6].filter(Boolean);
    const hasFailure = records.some(record => record.success === false);
    const hasSuccess = records.some(record => record.success !== false);
    const publishMessage = records.find(record => record.message)?.message || null;
    const publishAction = records.find(record => record.action && record.action !== 'skip')?.action || records[0]?.action || null;

    existing.published = hasSuccess && !hasFailure;
    existing.success = existing.published;
    existing.ok = existing.published;
    existing.publishAction = publishAction;
    existing.publishMessage = publishMessage;
    existing.publishStatus = hasFailure ? 'failed' : (records.length > 0 ? (records.every(record => record.action === 'skip') ? 'synced' : 'success') : 'missing');

    hostMap.set(key, existing);
  }

  return Array.from(hostMap.values()).sort((a, b) => `${a.host}`.localeCompare(`${b.host}`, 'en'));
}

function normalizeDomainResult(domain, hostEntries = [], summary = {}) {
  const hosts = aggregateHostResults(hostEntries);
  const total = Number(summary.total ?? hostEntries.length ?? 0);
  const failedCount = Number(summary.failedCount ?? hostEntries.filter(host => host.success === false).length);
  const successCount = Number(summary.successCount ?? hostEntries.filter(host => host.success !== false).length);
  const status = summary.status || (failedCount > 0 ? (successCount > 0 ? 'degraded' : 'failed') : 'success');
  const ipv4Summary = createFamilySummary({
    total: summary.ipv4Total,
    success: summary.ipv4SuccessCount,
    failure: summary.ipv4FailedCount,
    skipped: summary.ipv4SkippedCount,
    added: summary.ipv4AddedCount,
    updated: summary.ipv4UpdatedCount
  });
  const ipv6Summary = createFamilySummary({
    total: summary.ipv6Total,
    success: summary.ipv6SuccessCount,
    failure: summary.ipv6FailedCount,
    skipped: summary.ipv6SkippedCount,
    added: summary.ipv6AddedCount,
    updated: summary.ipv6UpdatedCount
  });

  return {
    domain,
    status,
    success: failedCount === 0,
    total,
    successCount,
    failedCount,
    skippedCount: Number(summary.skippedCount ?? hostEntries.filter(host => host.action === 'skip').length),
    addedCount: Number(summary.addedCount ?? hostEntries.filter(host => host.action === 'add').length),
    updatedCount: Number(summary.updatedCount ?? hostEntries.filter(host => host.action === 'update').length),
    publicIp: summary.publicIp || null,
    ipv4Summary: ipv4Summary.total > 0 ? ipv4Summary : buildSummaryFromHosts(hosts, 'ipv4'),
    ipv6Summary: ipv6Summary.total > 0 ? ipv6Summary : buildSummaryFromHosts(hosts, 'ipv6'),
    hosts
  };
}

function createEmptyDomainResult(domain) {
  return {
    domain,
    status: 'failed',
    success: false,
    total: 0,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    addedCount: 0,
    updatedCount: 0,
    publicIp: null,
    ipv4Summary: createFamilySummary(),
    ipv6Summary: createFamilySummary(),
    hosts: []
  };
}

function summarizeFamilies(domainResults = []) {
  return domainResults.reduce((acc, item) => {
    const ipv4 = createFamilySummary(item.ipv4Summary);
    const ipv6 = createFamilySummary(item.ipv6Summary);

    acc.ipv4.total += ipv4.total;
    acc.ipv4.success += ipv4.success;
    acc.ipv4.failure += ipv4.failure;
    acc.ipv4.skipped += ipv4.skipped;
    acc.ipv4.added += ipv4.added;
    acc.ipv4.updated += ipv4.updated;

    acc.ipv6.total += ipv6.total;
    acc.ipv6.success += ipv6.success;
    acc.ipv6.failure += ipv6.failure;
    acc.ipv6.skipped += ipv6.skipped;
    acc.ipv6.added += ipv6.added;
    acc.ipv6.updated += ipv6.updated;

    return acc;
  }, {
    ipv4: createFamilySummary(),
    ipv6: createFamilySummary()
  });
}

function getNormalizedDomainHosts(lastResult = {}) {
  return (lastResult.domainResults || []).flatMap(domainResult => {
    if (domainResult?.hosts?.some(host => host?.ipv4 || host?.ipv6)) {
      return domainResult.hosts;
    }

    return aggregateHostResults(domainResult?.hosts || []);
  });
}

function buildRecordFallback({ hostname, value, message }) {
  return {
    hostname,
    fqdn: hostname,
    value: value || null,
    action: null,
    success: false,
    message
  };
}

function normalizeRecord(record, fallback) {
  if (record && typeof record === 'object' && !Array.isArray(record)) {
    return {
      ...fallback,
      ...record,
      hostname: record.hostname || record.fqdn || fallback.hostname,
      fqdn: record.fqdn || record.hostname || fallback.fqdn,
      value: record.value ?? fallback.value,
      action: record.action ?? fallback.action,
      success: record.success ?? fallback.success,
      message: record.message ?? fallback.message
    };
  }

  if (typeof record === 'string' && record.trim()) {
    return {
      ...fallback,
      value: record.trim()
    };
  }

  return fallback;
}

function buildFailureResult({ domains = [], output = '', error = '', timestamp = new Date().toISOString(), previousState = {} }) {
  const domainResults = domains.map(createEmptyDomainResult);
  const recordsSummary = summarizeFamilies(domainResults);

  return {
    success: false,
    status: 'failed',
    output,
    error,
    domains,
    domainResults,
    failedDomains: domains,
    totalHosts: 0,
    successCount: 0,
    failureCount: 0,
    publicIp: extractPublicIp(output) || previousState.summary?.publicIp || null,
    recordsSummary,
    ipv4Summary: recordsSummary.ipv4,
    ipv6Summary: recordsSummary.ipv6,
    timestamp
  };
}

export class DDNSController {
  constructor(config, stateManager, serviceRegistry = null) {
    this.config = config;
    this.stateManager = stateManager;
    this.serviceRegistry = serviceRegistry;
  }

  async init() {
    console.log('🌐 初始化 DDNS 控制器...');
    this.updateSummary();
    console.log('✅ DDNS 控制器初始化完成');
  }

  getManagedDomain() {
    const envDomains = normalizeDomains(process.env.ALIYUN_DOMAIN || process.env.DOMAIN);
    if (envDomains.length > 0) {
      return envDomains[0];
    }

    const managedDomain = this.serviceRegistry?.getManagedDomain?.() || '222869.xyz';
    return normalizeDomains(managedDomain)[0] || '222869.xyz';
  }

  getWildcardDomain() {
    return `*.${this.getManagedDomain()}`;
  }

  getTrackedDomains() {
    const domains = [this.getManagedDomain()];

    if (this.config.extraDomains && Array.isArray(this.config.extraDomains)) {
      for (const extra of this.config.extraDomains) {
        const extraDomains = normalizeDomains(extra.domain);
        for (const domain of extraDomains) {
          if (!domains.includes(domain)) {
            domains.push(domain);
          }
        }
      }
    }

    return domains;
  }

  getIpv6Hosts() {
    const domain = this.getManagedDomain();
    const keyMachines = this.serviceRegistry?.getKeyMachinesWithDomains?.() || [];
    const devices = this.stateManager?.state?.devices?.devices || {};
    const lastResult = this.stateManager.getDDNSState?.()?.lastResult || {};
    const hostStatusMap = new Map();

    for (const domainResult of lastResult.domainResults || []) {
      for (const host of domainResult.hosts || []) {
        const hostname = host?.ipv6?.hostname || host?.hostname;
        if (hostname) {
          hostStatusMap.set(hostname, host);
        }
      }
    }

    return keyMachines.map(machine => {
      const liveDevice = devices[machine.id] || {};
      const ipv4 = machine.ipv4 || liveDevice.ipv4 || null;
      const ipv6 = liveDevice.ipv6 || machine.ipv6 || null;
      const hostname = machine.ddnsHostname || buildIpv6Hostname(ipv4, domain);
      const lastPublish = hostname ? hostStatusMap.get(hostname) : null;
      const ipv6Publish = lastPublish?.ipv6 || null;

      return {
        deviceId: machine.id,
        name: machine.name || `Device ${machine.id}`,
        ipv4,
        ipv6,
        hostname,
        published: ipv6Publish ? ipv6Publish.success !== false : Boolean(ipv6),
        publishAction: ipv6Publish?.action || null,
        publishMessage: ipv6Publish?.message || null,
        publishStatus: ipv6Publish
          ? (ipv6Publish.success === false ? 'failed' : (ipv6Publish.action === 'skip' ? 'synced' : 'success'))
          : (ipv6 ? 'synced' : 'missing'),
        lastSeen: liveDevice.lastSeen || null,
        isKeyMachine: true
      };
    });
  }

  getDualStackHosts() {
    const domain = this.getManagedDomain();
    const keyMachines = this.serviceRegistry?.getKeyMachinesWithDomains?.() || [];
    const devices = this.stateManager?.state?.devices?.devices || {};
    const lastResult = this.stateManager.getDDNSState?.()?.lastResult || {};
    const hostStatusMap = new Map();

    for (const host of getNormalizedDomainHosts(lastResult)) {
      const key = host?.host || host?.ipv4?.ipv4 || host?.ipv6?.ipv4;
      if (key) {
        hostStatusMap.set(key, host);
      }
    }

    return keyMachines.map(machine => {
      const liveDevice = devices[machine.id] || {};
      const ipv4 = machine.ipv4 || liveDevice.ipv4 || null;
      const ipv6 = liveDevice.ipv6 || machine.ipv6 || null;
      const hostKey = ipv4 ? `${ipv4}`.trim().split('.').pop() : machine.id;
      const hostState = hostStatusMap.get(hostKey) || null;
      const ipv4Hostname = buildIpv4Hostname(ipv4, domain);
      const ipv6Hostname = machine.ddnsHostname || buildIpv6Hostname(ipv4, domain);
      const ipv4Fallback = buildRecordFallback({
        hostname: ipv4Hostname,
        value: ipv4,
        message: ipv4 ? '等待发布结果' : '缺少 IPv4'
      });
      const ipv6Fallback = buildRecordFallback({
        hostname: ipv6Hostname,
        value: ipv6,
        message: ipv6 ? '等待发布结果' : '缺少 IPv6'
      });
      const ipv4Record = normalizeRecord(hostState?.ipv4Record || hostState?.ipv4, ipv4Fallback);
      const ipv6Record = normalizeRecord(hostState?.ipv6Record || hostState?.ipv6, ipv6Fallback);

      return {
        host: hostKey,
        deviceId: machine.id,
        name: machine.name || `Device ${machine.id}`,
        ipv4,
        ipv6,
        ipv4Record,
        ipv6Record,
        publishStatus: hostState?.publishStatus || 'missing',
        publishMessage: hostState?.publishMessage || null,
        lastSeen: liveDevice.lastSeen || null
      };
    });
  }

  updateSummary(partial = {}) {
    const ddnsState = this.stateManager.getDDNSState?.() || {};
    const lastResult = partial.lastResult || ddnsState.lastResult || null;
    const trackedDomains = partial.trackedDomains || ddnsState.summary?.trackedDomains || this.getTrackedDomains();
    const failedDomains = partial.failedDomains || lastResult?.failedDomains || [];
    const lastResultRecordsSummary = lastResult?.recordsSummary || summarizeFamilies(lastResult?.domainResults || []);
    const summaryRecordsSummary = ddnsState.summary?.recordsSummary || summarizeFamilies(ddnsState.summary?.domainResults || []);
    const recordsSummary = partial.recordsSummary || lastResultRecordsSummary || summaryRecordsSummary || summarizeFamilies([]);
    const ipv4Summary = createFamilySummary(partial.ipv4Summary || lastResult?.ipv4Summary || recordsSummary.ipv4 || ddnsState.summary?.ipv4Summary || {});
    const ipv6Summary = createFamilySummary(partial.ipv6Summary || lastResult?.ipv6Summary || recordsSummary.ipv6 || ddnsState.summary?.ipv6Summary || {});

    const summary = {
      publicIp: partial.publicIp ?? ddnsState.summary?.publicIp ?? null,
      primaryDomain: this.getManagedDomain(),
      wildcardDomain: this.getWildcardDomain(),
      ipv6Hosts: this.getIpv6Hosts(),
      dualStackHosts: this.getDualStackHosts(),
      trackedDomains,
      lastUpdate: partial.lastUpdate ?? ddnsState.lastUpdate ?? null,
      lastResult,
      publishStatus: partial.publishStatus ?? lastResult?.status ?? ddnsState.summary?.publishStatus ?? 'unknown',
      lastSuccessAt: partial.lastSuccessAt ?? ddnsState.summary?.lastSuccessAt ?? null,
      lastFailureAt: partial.lastFailureAt ?? ddnsState.summary?.lastFailureAt ?? null,
      failedDomains,
      failedDomainCount: failedDomains.length,
      domainResults: partial.domainResults ?? lastResult?.domainResults ?? [],
      totalHosts: partial.totalHosts ?? lastResult?.totalHosts ?? 0,
      successCount: partial.successCount ?? lastResult?.successCount ?? 0,
      failureCount: partial.failureCount ?? lastResult?.failureCount ?? 0,
      recordsSummary,
      ipv4Summary,
      ipv6Summary,
      ...partial
    };

    this.stateManager.updateDDNSState({
      summary,
      domains: summary.trackedDomains
    });

    return summary;
  }

  buildResult(allStdout, allStderr, domains) {
    const ddnsState = this.stateManager.getDDNSState?.() || {};
    const hostResults = extractTaggedJsonLines(allStdout, 'DDNS_RESULT');
    const summaryResults = extractTaggedJsonLines(allStdout, 'DDNS_SUMMARY');
    const domainResults = domains.map(domain => {
      const hosts = hostResults.filter(item => item.domain === domain);
      const summary = summaryResults.find(item => item.domain === domain) || {};
      return normalizeDomainResult(domain, hosts, summary);
    });

    const totalHosts = domainResults.reduce((sum, item) => sum + (item.total || 0), 0);
    const successCount = domainResults.reduce((sum, item) => sum + (item.successCount || 0), 0);
    const failureCount = domainResults.reduce((sum, item) => sum + (item.failedCount || 0), 0);
    const failedDomains = domainResults.filter(item => item.success === false).map(item => item.domain);
    const recordsSummary = summarizeFamilies(domainResults);

    let status = 'success';
    if (failureCount > 0 && successCount > 0) {
      status = 'degraded';
    } else if (failureCount > 0) {
      status = 'failed';
    }

    const parseError = domains.some(domain => !summaryResults.find(item => item.domain === domain))
      ? 'DDNS 脚本未返回完整的结构化汇总结果'
      : '';
    const error = [allStderr, parseError].filter(Boolean).join('\n').trim();
    const publicIp = summaryResults.find(item => item.publicIp)?.publicIp || extractPublicIp(allStdout) || ddnsState.summary?.publicIp || null;

    return {
      success: failureCount === 0 && !parseError,
      status: failureCount > 0 && successCount > 0 ? 'degraded' : (failureCount > 0 || parseError ? 'failed' : status),
      output: allStdout,
      error,
      domains,
      domainResults,
      failedDomains,
      totalHosts,
      successCount,
      failureCount,
      publicIp,
      recordsSummary,
      ipv4Summary: recordsSummary.ipv4,
      ipv6Summary: recordsSummary.ipv6,
      timestamp: new Date().toISOString()
    };
  }

  persistResult(result, force = false) {
    const ddnsState = this.stateManager.getDDNSState?.() || {};
    const summary = this.updateSummary({
      publicIp: result.publicIp,
      lastUpdate: result.timestamp,
      lastResult: result,
      publishStatus: result.status,
      trackedDomains: result.domains || this.getTrackedDomains(),
      failedDomains: result.failedDomains || [],
      domainResults: result.domainResults || [],
      totalHosts: result.totalHosts || 0,
      successCount: result.successCount || 0,
      failureCount: result.failureCount || 0,
      recordsSummary: result.recordsSummary,
      ipv4Summary: result.ipv4Summary,
      ipv6Summary: result.ipv6Summary,
      lastSuccessAt: result.success ? result.timestamp : (ddnsState.summary?.lastSuccessAt || null),
      lastFailureAt: result.success ? (ddnsState.summary?.lastFailureAt || null) : result.timestamp
    });

    this.stateManager.updateDDNSState({
      lastUpdate: result.timestamp,
      lastResult: result,
      summary,
      domains: result.domains || summary.trackedDomains
    });

    this.stateManager.addHistory('ddns', {
      event: force ? 'refresh' : 'update',
      success: result.success,
      status: result.status,
      domains: result.domains,
      failedDomains: result.failedDomains || [],
      domainCount: result.domainResults?.length || 0,
      totalHosts: result.totalHosts || 0,
      successCount: result.successCount || 0,
      failureCount: result.failureCount || 0,
      publicIp: result.publicIp,
      ipv4Summary: result.ipv4Summary,
      ipv6Summary: result.ipv6Summary,
      error: result.error || null,
      output: result.output
    });

    return summary;
  }

  async update(force = false) {
    const ddnsState = this.stateManager.getDDNSState?.() || {};

    try {
      if (!this.config.enabled) {
        console.log('⏭️  DDNS 已禁用，跳过更新');
        return null;
      }

      console.log('🔄 执行 DDNS 更新...');
      const scriptPath = resolveScriptPath(this.config.scriptPath);
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`DDNS 脚本不存在: ${scriptPath}`);
      }
      const bashCommand = resolveBashCommand();
      const execOptions = {
        cwd: PROJECT_ROOT,
        env: { ...process.env },
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true
      };

      const lanDevicesLines = buildLanDevicesCacheLines(this.stateManager);
      const domains = this.getTrackedDomains();

      let allStdout = '';
      let allStderr = '';

      for (const domain of domains) {
        console.log(`🌐 DDNS 更新域名: ${domain}`);
        const domainEnv = { ...execOptions.env, DOMAIN: domain };
        const domainExecOptions = { ...execOptions, env: domainEnv };

        let stdout = '';
        let stderr = '';

        if (lanDevicesLines.length > 0) {
          const cachePath = path.resolve(PROJECT_ROOT, '.lan_devices.txt');
          fs.writeFileSync(cachePath, `${lanDevicesLines.join('\n')}\n`, 'utf8');

          try {
            const ddnsResult = await execFileAsync(
              bashCommand,
              [scriptPath, 'ddns'],
              domainExecOptions
            );
            stdout = ddnsResult.stdout;
            stderr = ddnsResult.stderr;
          } catch (error) {
            stdout = error.stdout || '';
            stderr = error.stderr || error.message || '';
          }

          const htmlResult = await execFileAsync(
            bashCommand,
            [scriptPath, 'html'],
            domainExecOptions
          );

          stdout = [stdout, htmlResult.stdout].filter(Boolean).join('\n');
          stderr = [stderr, htmlResult.stderr].filter(Boolean).join('\n');
        } else {
          try {
            const fullResult = await execFileAsync(
              bashCommand,
              [scriptPath, 'all'],
              domainExecOptions
            );
            stdout = fullResult.stdout;
            stderr = fullResult.stderr;
          } catch (error) {
            stdout = error.stdout || '';
            stderr = error.stderr || error.message || '';
          }
        }

        allStdout += `\n--- ${domain} ---\n${stdout}`;
        allStderr += allStderr && stderr ? `\n${stderr}` : stderr;
      }

      const result = this.buildResult(allStdout, allStderr, domains);
      this.persistResult(result, force);

      if (result.success) {
        console.log(`✅ DDNS 更新成功 (${domains.join(', ')})`);
      } else {
        console.warn(`⚠️  DDNS 更新${result.status === 'degraded' ? '部分失败' : '失败'}:`, result.error || result.failedDomains.join(', '));
      }

      return result;
    } catch (error) {
      console.error('❌ DDNS 更新异常:', error.message);

      const result = buildFailureResult({
        domains: this.getTrackedDomains(),
        output: '',
        error: error.message,
        previousState: ddnsState
      });

      this.persistResult(result, force);
      return result;
    }
  }

  async refresh() {
    return await this.update(true);
  }

  getSummary() {
    return this.updateSummary();
  }

  getStatus() {
    const ddnsState = this.stateManager.getDDNSState();
    return {
      ...ddnsState,
      summary: this.getSummary(),
      publishStatus: ddnsState?.lastResult?.status || ddnsState?.summary?.publishStatus || 'unknown',
      enabled: this.config.enabled !== false,
      scriptPath: this.config.scriptPath
    };
  }

  getHistory() {
    return this.stateManager.getDDNSState()?.history || [];
  }
}
