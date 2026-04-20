#!/usr/bin/env node
/**
 * Lucky 反向代理 → SunPanel 自动同步脚本
 *
 * 功能：
 * - 从 Lucky 读取反向代理配置
 * - 自动在 SunPanel 创建/更新图标卡片
 * - 支持增量更新和状态跟踪
 *
 * 用法：
 *   node sync-lucky-to-sunpanel.mjs --init      # 初始化
 *   node sync-lucky-to-sunpanel.mjs --sync      # 执行同步
 *   node sync-lucky-to-sunpanel.mjs --status    # 查看状态
 *   node sync-lucky-to-sunpanel.mjs --dry-run   # 预览同步
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadEnvFile as loadSharedEnvFile } from '../lib/utils/env-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT_DIR, 'config/lucky-to-sunpanel.json');
const STATE_FILE = path.join(ROOT_DIR, 'data/lucky-to-sunpanel-state.json');

// ==================== 加载环境变量 ====================

function loadEnvFile() {
  return loadSharedEnvFile({
    searchPaths: [
      path.join(ROOT_DIR, '.env'),
      '/home/leecaiy/workspace/auto-dnms/.env',
      '/home/leecaiy/workspace/auto-dnns/.env'
    ]
  });

  const possiblePaths = [
    path.join(ROOT_DIR, '.env'),
    '/home/leecaiy/workspace/auto-dnms/.env',
    '/home/leecaiy/workspace/auto-dnns/.env'
  ];

  for (const envPath of possiblePaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        content.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
              process.env[key.trim()] = valueParts.join('=').trim();
            }
          }
        });
        console.log(`✅ 已加载 .env 文件: ${envPath}`);
        break;
      }
    } catch (error) {
      // 继续尝试下一个路径
    }
  }
}

// 自动加载 .env
loadEnvFile();

// ==================== 工具函数 ====================

/**
 * 日志输出
 */
const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${new Date().toISOString()} ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  debug: (msg) => process.env.DEBUG && console.log(`[DEBUG] ${msg}`)
};

/**
 * 延迟函数
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 计算配置的 Hash 值
 */
function calculateHash(proxy) {
  const data = `${proxy.Remark}|${proxy.Domains?.join(',') || ''}|${proxy.Locations?.join(',') || ''}|${proxy.Enable}`;
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * 从域名生成 onlyName
 */
function generateOnlyName(domain) {
  return domain
    .replace(/^https?:\/\//, '')
    .replace(/[\/:]/g, '-')
    .replace(/\./g, '-')
    .toLowerCase();
}

/**
 * 加载配置文件
 */
async function loadConfig() {
  try {
    let config = {};

    // 加载 JSON 配置文件
    try {
      const content = await fs.readFile(CONFIG_FILE, 'utf-8');
      config = JSON.parse(content);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // 配置文件不存在，使用默认值
    }

    // 环境变量优先
    return {
      lucky: {
        apiBase: process.env.LUCKY_API_BASE || config.lucky?.apiBase || 'http://192.168.3.200:16601',
        openToken: process.env.LUCKY_OPEN_TOKEN || config.lucky?.openToken
      },
      sunpanel: {
        apiBase: process.env.SUNPANEL_API_BASE || config.sunpanel?.apiBase || 'http://192.168.3.200:20001/openapi/v1',
        apiToken: process.env.SUNPANEL_API_TOKEN || config.sunpanel?.apiToken,
        defaultGroupId: config.sunpanel?.defaultGroupId || 9
      },
      sync: config.sync || {
        interval: 300,
        autoCreateGroups: true,
        deleteRemoved: false,
        saveIcon: true,
        onlySyncEnabled: true
      },
      groups: config.groups || {},
      exclude: config.exclude || {},
      includeOnly: config.includeOnly || {}
    };
  } catch (error) {
    throw new Error(`配置加载失败: ${error.message}`);
  }
}

/**
 * 加载状态文件
 */
async function loadState() {
  try {
    const content = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { lastSync: null, items: {} };
    }
    throw error;
  }
}

/**
 * 保存状态文件
 */
async function saveState(state) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

// ==================== Lucky API ====================

/**
 * 调用 Lucky API
 */
async function luckyFetch(config, endpoint, options = {}) {
  const url = `${config.lucky.apiBase}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${config.lucky.openToken}`,
    'Content-Type': 'application/json'
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    throw new Error(`Lucky API 请求失败: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 获取所有反向代理
 */
async function getLuckyProxies(config) {
  const data = await luckyFetch(config, '/api/webservice/rules');

  if (data.ret !== 0) {
    throw new Error(`Lucky API 返回错误: ${data.msg}`);
  }

  // 提取所有反向代理子规则
  const proxies = [];
  for (const rule of data.ruleList || []) {
    for (const proxy of rule.ProxyList || []) {
      if (proxy.WebServiceType === 'reverseproxy') {
        proxies.push({
          ...proxy,
          listenPort: rule.ListenPort
        });
      }
    }
  }

  return proxies;
}

// ==================== SunPanel API ====================

/**
 * 调用 SunPanel API
 */
async function sunpanelFetch(config, endpoint, data) {
  const url = `${config.sunpanel.apiBase}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'token': config.sunpanel.apiToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(`SunPanel API 错误 ${result.code}: ${result.msg}`);
  }

  return result.data;
}

/**
 * 获取所有分组
 */
async function getSunpanelGroups(config) {
  return await sunpanelFetch(config, '/itemGroup/getList', {});
}

/**
 * 创建分组
 */
async function createSunpanelGroup(config, title, onlyName) {
  return await sunpanelFetch(config, '/itemGroup/create', { title, onlyName });
}

/**
 * 获取项目信息
 */
async function getSunpanelItem(config, onlyName) {
  try {
    return await sunpanelFetch(config, '/item/getInfoByOnlyName', { onlyName });
  } catch (error) {
    if (error.message.includes('1203')) {
      return null; // 项目不存在
    }
    throw error;
  }
}

/**
 * 创建项目
 */
async function createSunpanelItem(config, item) {
  return await sunpanelFetch(config, '/item/create', item);
}

/**
 * 更新项目
 */
async function updateSunpanelItem(config, item) {
  return await sunpanelFetch(config, '/item/update', item);
}

// ==================== 分组匹配 ====================

/**
 * 根据规则匹配分组
 */
function matchGroup(proxy, config) {
  const groups = config.groups;

  // 优先检查关键词
  for (const [groupName, groupConfig] of Object.entries(groups)) {
    if (groupConfig.keywords) {
      for (const keyword of groupConfig.keywords) {
        const searchText = `${proxy.Remark} ${proxy.Domains?.join(' ') || ''}`.toLowerCase();
        if (searchText.includes(keyword.toLowerCase())) {
          return { name: groupName, config: groupConfig };
        }
      }
    }
  }

  // 检查端口范围
  if (proxy.listenPort) {
    for (const [groupName, groupConfig] of Object.entries(groups)) {
      if (groupConfig.portRanges) {
        for (const [start, end] of groupConfig.portRanges) {
          if (proxy.listenPort >= start && proxy.listenPort <= end) {
            return { name: groupName, config: groupConfig };
          }
        }
      }
    }
  }

  // 默认分组
  return { name: '工具', config: groups['工具'] || {} };
}

/**
 * 获取或创建 SunPanel 分组 ID
 */
async function getOrCreateGroupId(config, groupName, groupConfig) {
  // 获取所有分组
  const groups = await getSunpanelGroups(config);
  const existingGroup = groups.list.find(g => g.title === groupName);

  if (existingGroup) {
    return existingGroup.itemGroupID;
  }

  // 创建新分组
  if (config.sync.autoCreateGroups) {
    logger.info(`创建新分组: ${groupName}`);
    const onlyName = groupName.toLowerCase().replace(/\s+/g, '-');
    await createSunpanelGroup(config, groupName, onlyName);
    await sleep(500); // 等待创建完成

    // 重新获取分组列表
    const newGroups = await getSunpanelGroups(config);
    const newGroup = newGroups.list.find(g => g.title === groupName);
    return newGroup?.itemGroupID || config.sunpanel.defaultGroupId;
  }

  return config.sunpanel.defaultGroupId;
}

// ==================== 数据映射 ====================

/**
 * Lucky 代理 → SunPanel 卡片
 */
function luckyToSunpanel(proxy, groupId, config) {
  const domain = proxy.Domains?.[0];
  if (!domain) {
    throw new Error(`代理 ${proxy.Remark} 没有域名`);
  }

  const onlyName = generateOnlyName(domain);
  const url = domain.startsWith('http') ? domain : `https://${domain}`;
  const lanUrl = proxy.Locations?.[0] || '';
  const iconUrl = `${url}/favicon.ico`;

  return {
    title: proxy.Remark || domain,
    url,
    lanUrl,
    iconUrl,
    onlyName,
    description: proxy.Remark || '',
    itemGroupID: groupId,
    isSaveIcon: config.sync.saveIcon
  };
}

// ==================== 过滤逻辑 ====================

/**
 * 检查是否应该跳过此代理
 */
function shouldSkip(proxy, config) {
  const { exclude, includeOnly, sync } = config;

  // 仅同步启用的代理
  if (sync.onlySyncEnabled && !proxy.Enable) {
    return true;
  }

  // 如果设置了 includeOnly，只处理匹配的
  if (includeOnly.remarks?.length > 0 || includeOnly.domains?.length > 0 || includeOnly.ports?.length > 0) {
    const matchRemark = includeOnly.remarks?.some(r => proxy.Remark?.includes(r));
    const matchDomain = includeOnly.domains?.some(d => proxy.Domains?.some(domain => domain.includes(d)));
    const matchPort = includeOnly.ports?.includes(proxy.listenPort);

    if (!matchRemark && !matchDomain && !matchPort) {
      return true;
    }
  }

  // 排除规则
  const excludeRemark = exclude.remarks?.some(r => proxy.Remark?.includes(r));
  const excludeDomain = exclude.domains?.some(d => proxy.Domains?.some(domain => domain.includes(d)));
  const excludePort = exclude.ports?.includes(proxy.listenPort);

  if (excludeRemark || excludeDomain || excludePort) {
    return true;
  }

  return false;
}

// ==================== 增量检测 ====================

/**
 * 检测变更
 */
function detectChanges(luckyProxies, state) {
  const changes = {
    added: [],
    modified: [],
    removed: [],
    unchanged: []
  };

  const luckyKeys = new Set();

  for (const proxy of luckyProxies) {
    const key = proxy.Key;
    luckyKeys.add(key);

    const hash = calculateHash(proxy);
    const existing = state.items[key];

    if (!existing) {
      changes.added.push({ proxy, hash });
    } else if (existing.luckyHash !== hash) {
      changes.modified.push({ proxy, hash, existing });
    } else {
      changes.unchanged.push({ proxy, existing });
    }
  }

  // 检测删除的
  for (const [key, item] of Object.entries(state.items)) {
    if (!luckyKeys.has(key) && item.status === 'synced') {
      changes.removed.push({ key, item });
    }
  }

  return changes;
}

// ==================== 主同步逻辑 ====================

/**
 * 执行同步
 */
async function doSync(config, options = {}) {
  const dryRun = options.dryRun || false;
  const state = await loadState();

  logger.info('开始同步 Lucky → SunPanel');
  if (dryRun) {
    logger.warn('【预览模式】不会实际修改 SunPanel');
  }

  try {
    // 1. 从 Lucky 获取代理列表
    logger.info('从 Lucky 获取反向代理列表...');
    let allProxies = await getLuckyProxies(config);
    logger.info(`找到 ${allProxies.length} 个反向代理`);

    // 2. 过滤
    const proxies = allProxies.filter(p => !shouldSkip(p, config));
    logger.info(`过滤后剩余 ${proxies.length} 个代理`);

    // 3. 检测变更
    const changes = detectChanges(proxies, state);
    logger.info(`变更: 新增 ${changes.added.length}, 修改 ${changes.modified.length}, 删除 ${changes.removed.length}`);

    if (changes.added.length === 0 && changes.modified.length === 0 && changes.removed.length === 0) {
      logger.success('没有需要同步的变更');
      return;
    }

    // 4. 处理新增
    for (const { proxy, hash } of changes.added) {
      const domain = proxy.Domains?.[0] || 'unknown';
      logger.info(`[新增] ${proxy.Remark} (${domain})`);

      if (!dryRun) {
        try {
          const group = matchGroup(proxy, config);
          const groupId = await getOrCreateGroupId(config, group.name, group.config);
          const item = luckyToSunpanel(proxy, groupId, config);

          await createSunpanelItem(config, item);
          await sleep(300);

          state.items[proxy.Key] = {
            luckyKey: proxy.Key,
            sunpanelOnlyName: item.onlyName,
            luckyHash: hash,
            lastUpdate: new Date().toISOString(),
            status: 'synced'
          };
          logger.success(`✓ ${item.onlyName}`);
        } catch (error) {
          logger.error(`✗ ${proxy.Remark}: ${error.message}`);
        }
      }
    }

    // 5. 处理修改
    for (const { proxy, hash } of changes.modified) {
      const domain = proxy.Domains?.[0] || 'unknown';
      logger.info(`[修改] ${proxy.Remark} (${domain})`);

      if (!dryRun) {
        try {
          const group = matchGroup(proxy, config);
          const groupId = await getOrCreateGroupId(config, group.name, group.config);
          const item = luckyToSunpanel(proxy, groupId, config);

          await updateSunpanelItem(config, item);
          await sleep(300);

          state.items[proxy.Key] = {
            luckyKey: proxy.Key,
            sunpanelOnlyName: item.onlyName,
            luckyHash: hash,
            lastUpdate: new Date().toISOString(),
            status: 'synced'
          };
          logger.success(`✓ ${item.onlyName}`);
        } catch (error) {
          logger.error(`✗ ${proxy.Remark}: ${error.message}`);
        }
      }
    }

    // 6. 处理删除
    if (config.sync.deleteRemoved) {
      for (const { key, item } of changes.removed) {
        logger.info(`[删除] ${item.sunpanelOnlyName}`);
        if (!dryRun) {
          // SunPanel API 没有删除接口，标记为已删除
          state.items[key].status = 'deleted';
          logger.success(`✓ ${item.sunpanelOnlyName} 标记为已删除`);
        }
      }
    } else {
      if (changes.removed.length > 0) {
        logger.warn(`检测到 ${changes.removed.length} 个已删除的项目（未删除，配置中 deleteRemoved=false）`);
      }
    }

    // 7. 保存状态
    if (!dryRun) {
      state.lastSync = new Date().toISOString();
      await saveState(state);
      logger.success('同步完成');
    }

  } catch (error) {
    logger.error(`同步失败: ${error.message}`);
    throw error;
  }
}

/**
 * 初始化
 */
async function doInit(config) {
  logger.info('初始化同步配置...');

  const state = await loadState();

  // 测试 Lucky 连接
  logger.info('测试 Lucky API 连接...');
  const proxies = await getLuckyProxies(config);
  logger.success(`Lucky 连接成功，找到 ${proxies.length} 个反向代理`);

  // 测试 SunPanel 连接
  logger.info('测试 SunPanel API 连接...');
  const groups = await getSunpanelGroups(config);
  logger.success(`SunPanel 连接成功，找到 ${groups.count} 个分组`);

  // 执行首次同步
  logger.info('执行首次同步...');
  await doSync(config);

  logger.success('初始化完成！');
}

/**
 * 显示状态
 */
async function showStatus(config) {
  const state = await loadState();

  console.log('\n📊 同步状态\n');

  if (state.lastSync) {
    console.log(`最后同步: ${new Date(state.lastSync).toLocaleString('zh-CN')}`);
  } else {
    console.log('最后同步: 从未同步');
  }

  const items = Object.values(state.items);
  const synced = items.filter(i => i.status === 'synced').length;
  const deleted = items.filter(i => i.status === 'deleted').length;

  console.log(`总计: ${items.length} 个项目`);
  console.log(`已同步: ${synced} 个`);
  console.log(`已删除: ${deleted} 个`);

  // 显示最近的项目
  console.log('\n最近同步的项目:');
  const recent = items
    .filter(i => i.status === 'synced')
    .sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate))
    .slice(0, 10);

  for (const item of recent) {
    const date = new Date(item.lastUpdate).toLocaleString('zh-CN');
    console.log(`  ${item.sunpanelOnlyName} - ${date}`);
  }

  console.log('');
}

// ==================== CLI 入口 ====================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    // 加载配置
    const config = await loadConfig();

    switch (command) {
      case '--init':
        await doInit(config);
        break;

      case '--sync':
        await doSync(config);
        break;

      case '--dry-run':
        await doSync(config, { dryRun: true });
        break;

      case '--status':
        await showStatus(config);
        break;

      default:
        console.log(`
Lucky → SunPanel 自动同步工具

用法:
  node sync-lucky-to-sunpanel.mjs --init      # 初始化并首次同步
  node sync-lucky-to-sunpanel.mjs --sync      # 执行同步
  node sync-lucky-to-sunpanel.mjs --dry-run   # 预览同步（不实际执行）
  node sync-lucky-to-sunpanel.mjs --status    # 查看同步状态

配置文件: ${CONFIG_FILE}
状态文件: ${STATE_FILE}
        `);
    }
  } catch (error) {
    logger.error(error.message);
    process.exit(1);
  }
}

// 运行
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
