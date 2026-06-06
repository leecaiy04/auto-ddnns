#!/usr/bin/env node
/**
 * Sun Panel API 客户端
 * 用于管理 Sun Panel 的图标卡片和分组
 */

import { getEnv } from '../../shared/env-loader.mjs';
import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'fs';

const DEFAULT_API_BASE = 'http://192.168.9.2:20001/api';
const DEBUG_LOG = '/tmp/sunpanel-debug.log';

// Token 缓存
let cachedToken = null;
let tokenExpireTime = null;

function debugLog(message) {
  try {
    const timestamp = new Date().toISOString();
    appendFileSync(DEBUG_LOG, `[${timestamp}] ${message}\n`);
  } catch (e) {
    // ignore
  }
}

/**
 * 登录 SunPanel 获取 token
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @param {string} apiBase - API 基础 URL
 * @returns {Promise<string>} token
 */
async function loginAndGetToken(username, password, apiBase) {
  // 尝试内部 API 登录端点
  const internalLoginUrl = `${apiBase.replace('/openapi/v1', '')}/api/login/account`;

  console.log('[SunPanel] 尝试登录获取新 token...');
  debugLog(`Attempting login to ${internalLoginUrl}`);

  try {
    const response = await fetch(internalLoginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('登录失败：返回非 JSON 响应');
    }

    const result = await response.json();

    if (result.code !== 0) {
      throw new Error(`登录失败：${result.msg || result.code}`);
    }

    const token = result.data?.token;
    if (!token) {
      throw new Error('登录成功但未返回 token');
    }

    // 缓存 token，设置 23 小时过期（SunPanel token 通常 24 小时有效）
    cachedToken = token;
    tokenExpireTime = Date.now() + 23 * 60 * 60 * 1000;

    console.log('[SunPanel] ✅ 登录成功，已获取新 token');
    debugLog(`Login successful, token: ${token.substring(0, 10)}...`);

    return token;
  } catch (error) {
    console.error('[SunPanel] ❌ 登录失败:', error.message);
    debugLog(`Login failed: ${error.message}`);
    throw error;
  }
}

function normalizeApiBase(apiBase) {
  return `${apiBase || DEFAULT_API_BASE}`.replace(/\/+$/u, '');
}

function resolveConfig(config = null) {
  const overrides = config ?? {};

  // 优先使用缓存的 token（如果未过期）
  let token = null;
  if (cachedToken && tokenExpireTime && Date.now() < tokenExpireTime) {
    token = cachedToken;
    debugLog('Using cached token');
  } else {
    token = overrides.apiToken ?? getEnv('SUNPANEL_API_TOKEN', '');
    debugLog(`Using token from config/env: ${token ? token.substring(0, 10) + '...' : 'EMPTY'}`);
  }

  console.log('[SunPanel] Token from env:', token ? `${token.substring(0, 10)}...` : 'EMPTY');

  return {
    apiBase: normalizeApiBase(overrides.apiBase ?? getEnv('SUNPANEL_API_BASE', DEFAULT_API_BASE)),
    apiToken: token,
    username: overrides.username ?? getEnv('SUNPANEL_USERNAME', ''),
    password: overrides.password ?? getEnv('SUNPANEL_PASSWORD', '')
  };
}

export function getSunPanelAuthConfig(config = null) {
  const resolvedConfig = resolveConfig(config);
  return {
    apiBase: resolvedConfig.apiBase,
    hasToken: Boolean(resolvedConfig.apiToken)
  };
}

/**
 * 调用 Sun Panel API
 * @param {string} endpoint - API 端点
 * @param {object} data - 请求数据
 * @param {object} config - 配置对象
 * @param {boolean} isRetry - 是否为重试请求
 * @returns {Promise<object>} 响应数据
 */
async function callApi(endpoint, data = {}, config = null, isRetry = false) {
  const resolvedConfig = resolveConfig(config);
  const url = `${resolvedConfig.apiBase}${endpoint}`;
  const timeoutMs = 30000;

  console.log('[SunPanel] API Call:', {
    url,
    endpoint,
    hasToken: Boolean(resolvedConfig.apiToken),
    tokenPreview: resolvedConfig.apiToken ? `${resolvedConfig.apiToken.substring(0, 10)}...` : 'EMPTY'
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'token': resolvedConfig.apiToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(timeoutMs)
  });

  // 检查响应类型
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    console.error('[SunPanel] Non-JSON response:', {
      endpoint,
      status: response.status,
      contentType,
      bodyPreview: text.substring(0, 200)
    });
    throw new Error(`API returned non-JSON response (${response.status}): ${text.substring(0, 100)}`);
  }

  const result = await response.json();

  console.log('[SunPanel] API Response:', {
    endpoint,
    code: result.code,
    msg: result.msg
  });

  // 如果 token 过期且有用户名密码，尝试重新登录
  if (result.code === 1001 && !isRetry && resolvedConfig.username && resolvedConfig.password) {
    console.log('[SunPanel] Token 过期，尝试自动重新登录...');
    try {
      const newToken = await loginAndGetToken(
        resolvedConfig.username,
        resolvedConfig.password,
        resolvedConfig.apiBase
      );

      // 使用新 token 重试请求
      return await callApi(endpoint, data, { ...config, apiToken: newToken }, true);
    } catch (loginError) {
      console.error('[SunPanel] 自动登录失败:', loginError.message);
      throw new Error(`Token expired and auto-login failed: ${loginError.message}`);
    }
  }

  if (result.code !== 0) {
    throw new Error(`API Error ${result.code}: ${result.msg}`);
  }

  return result.data;
}

/**
 * 获取 Sun Panel 版本信息
 * @returns {Promise<object>} 版本信息
 */
export async function getVersion(config = null) {
  return await callApi('/version', {}, config);
}

/**
 * 创建图标卡片分组
 * @param {object} options - 分组选项
 * @param {string} options.title - 分组标题
 * @param {string} options.onlyName - 分组唯一标识
 * @returns {Promise<void>}
 */
export async function createGroup({ title, onlyName }, config = null) {
  return await callApi('/itemGroup/create', { title, onlyName }, config);
}

/**
 * 获取所有分组列表
 * @returns {Promise<object>} 分组列表
 */
export async function getGroupList(config = null) {
  return await callApi('/itemGroup/getList', {}, config);
}

/**
 * 获取分组信息
 * @param {object} options - 查询选项
 * @param {number} options.itemGroupID - 分组 ID
 * @param {string} options.onlyName - 分组唯一标识
 * @returns {Promise<object>} 分组信息
 */
export async function getGroupInfo({ itemGroupID, onlyName }, config = null) {
  return await callApi('/itemGroup/getInfo', { itemGroupID, onlyName }, config);
}

/**
 * 创建图标卡片
 * @param {object} options - 卡片选项
 * @param {string} options.title - 标题
 * @param {string} options.url - 地址（必填）
 * @param {string} options.onlyName - 唯一标识
 * @param {string} options.iconUrl - 图像地址
 * @param {string} options.lanUrl - 内网地址
 * @param {string} options.description - 描述信息
 * @param {number} options.itemGroupID - 分组 ID
 * @param {string} options.itemGroupOnlyName - 分组唯一标识
 * @param {boolean} options.isSaveIcon - 是否保存图标到本地
 * @returns {Promise<void>}
 */
export async function createItem({
  title,
  url,
  onlyName,
  iconUrl = '',
  lanUrl = '',
  description = '',
  itemGroupID,
  itemGroupOnlyName,
  isSaveIcon = false
}, config = null) {
  return await callApi('/item/create', {
    title,
    url,
    onlyName,
    iconUrl,
    lanUrl,
    description,
    itemGroupID,
    itemGroupOnlyName,
    isSaveIcon
  }, config);
}

/**
 * 根据唯一标识获取项目信息
 * @param {string} onlyName - 唯一标识
 * @returns {Promise<object>} 项目信息
 */
export async function getItemInfo(onlyName, config = null) {
  return await callApi('/item/getInfoByOnlyName', { onlyName }, config);
}

/**
 * 更新图标卡片
 * @param {object} options - 更新选项
 * @param {string} options.onlyName - 唯一标识（必填）
 * @param {string} options.title - 标题
 * @param {string} options.url - 地址
 * @param {string} options.iconUrl - 图像地址
 * @param {string} options.lanUrl - 内网地址
 * @param {string} options.description - 描述信息
 * @param {number} options.itemGroupID - 分组 ID
 * @param {string} options.itemGroupOnlyName - 分组唯一标识
 * @param {boolean} options.isSaveIcon - 是否保存图标到本地
 * @returns {Promise<void>}
 */
export async function updateItem({
  onlyName,
  title,
  url,
  iconUrl,
  lanUrl,
  description,
  itemGroupID,
  itemGroupOnlyName,
  isSaveIcon
}, config = null) {
  const data = { onlyName };

  // 只包含提供的字段
  if (title !== undefined) data.title = title;
  if (url !== undefined) data.url = url;
  if (iconUrl !== undefined) data.iconUrl = iconUrl;
  if (lanUrl !== undefined) data.lanUrl = lanUrl;
  if (description !== undefined) data.description = description;
  if (itemGroupID !== undefined) data.itemGroupID = itemGroupID;
  if (itemGroupOnlyName !== undefined) data.itemGroupOnlyName = itemGroupOnlyName;
  if (isSaveIcon !== undefined) data.isSaveIcon = isSaveIcon;

  return await callApi('/item/update', data, config);
}

/**
 * 删除图标卡片
 * @param {string} onlyName - 唯一标识
 * @returns {Promise<void>}
 */
export async function deleteItem(onlyName, config = null) {
  return await callApi('/item/delete', { onlyName }, config);
}

/**
 * 测试连接
 * @returns {Promise<boolean>} 连接是否成功
 */
export async function testConnection(config = null) {
  try {
    const version = await getVersion(config);
    console.log(`✅ Sun Panel 连接成功！版本: ${version.version}`);
    return true;
  } catch (error) {
    console.error('❌ Sun Panel 连接失败:', error.message);
    return false;
  }
}

// ==================== 便捷方法 ====================

/**
 * 获取所有分组和项目（内部 API）
 * @param {Object} config - 配置对象
 * @param {boolean} isRetry - 是否为重试请求
 * @returns {Promise<Object>} 所有分组和项目
 */
export async function getAllGroupsWithItems(config = null, isRetry = false) {
  const resolvedConfig = resolveConfig(config);
  const url = `${resolvedConfig.apiBase.replace('/openapi/v1', '')}/api/panel/itemIcon/getListAllGroup`;
  const timeoutMs = 30000;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'token': resolvedConfig.apiToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(`API returned non-JSON response (${response.status}): ${text.substring(0, 100)}`);
  }

  const result = await response.json();

  // 如果 token 过期且有用户名密码，尝试重新登录
  if (result.code === 1001 && !isRetry && resolvedConfig.username && resolvedConfig.password) {
    console.log('[SunPanel] Token 过期，尝试自动重新登录...');
    try {
      const newToken = await loginAndGetToken(
        resolvedConfig.username,
        resolvedConfig.password,
        resolvedConfig.apiBase
      );

      // 使用新 token 重试请求
      return await getAllGroupsWithItems({ ...config, apiToken: newToken }, true);
    } catch (loginError) {
      console.error('[SunPanel] 自动登录失败:', loginError.message);
      throw new Error(`Token expired and auto-login failed: ${loginError.message}`);
    }
  }

  if (result.code !== 0) {
    throw new Error(`API Error ${result.code}: ${result.msg}`);
  }

  return result.data;
}

/**
 * 列出所有项目（扁平化）
 * @param {Object} config - 配置对象
 * @returns {Promise<Array>} 所有项目的扁平数组
 */
export async function listAllItems(config = null) {
  try {
    const data = await getAllGroupsWithItems(config);
    const items = [];

    if (data && Array.isArray(data.list)) {
      for (const group of data.list) {
        if (group.itemInfos && Array.isArray(group.itemInfos)) {
          for (const item of group.itemInfos) {
            items.push({
              ...item,
              groupTitle: group.title,
              groupOnlyName: group.onlyName,
              groupId: group.id
            });
          }
        }
      }
    }

    return items;
  } catch (error) {
    // 如果内部 API 失败，尝试使用 OpenAPI
    console.warn('[SunPanel] 内部 API 失败，回退到 OpenAPI:', error.message);
    const groups = await getGroupList(config);
    const items = [];

    if (groups && Array.isArray(groups.list)) {
      for (const group of groups.list) {
        // OpenAPI 需要逐个获取分组信息
        try {
          const groupInfo = await getGroupInfo({ itemGroupID: group.itemGroupID }, config);
          if (groupInfo.items && Array.isArray(groupInfo.items)) {
            for (const item of groupInfo.items) {
              items.push({
                ...item,
                groupTitle: group.title,
                groupOnlyName: group.onlyName,
                groupId: group.itemGroupID
              });
            }
          }
        } catch (e) {
          console.warn(`[SunPanel] 获取分组 ${group.title} 详情失败:`, e.message);
        }
      }
    }

    return items;
  }
}

/**
 * 根据标题查找项目
 * @param {string} title - 项目标题
 * @param {Object} config - 配置对象
 * @returns {Promise<Object|null>} 项目对象或 null
 */
export async function findItemByTitle(title, config = null) {
  const items = await listAllItems(config);
  return items.find(item => item.title === title) || null;
}

/**
 * 根据唯一标识查找项目
 * @param {string} onlyName - 唯一标识
 * @param {Object} config - 配置对象
 * @returns {Promise<Object|null>} 项目对象或 null
 */
export async function findItemByOnlyName(onlyName, config = null) {
  try {
    return await getItemInfo(onlyName, config);
  } catch (error) {
    // 如果通过 onlyName 查询失败，尝试从列表中查找
    const items = await listAllItems(config);
    return items.find(item => item.onlyName === onlyName) || null;
  }
}

/**
 * 根据标题查找分组
 * @param {string} title - 分组标题
 * @param {Object} config - 配置对象
 * @returns {Promise<Object|null>} 分组对象或 null
 */
export async function findGroupByTitle(title, config = null) {
  try {
    const data = await getAllGroupsWithItems(config);
    if (data && Array.isArray(data.list)) {
      return data.list.find(group => group.title === title) || null;
    }
  } catch (error) {
    // 回退到 OpenAPI
    const groups = await getGroupList(config);
    if (groups && Array.isArray(groups.list)) {
      return groups.list.find(group => group.title === title) || null;
    }
  }

  return null;
}

/**
 * 根据唯一标识查找分组
 * @param {string} onlyName - 唯一标识
 * @param {Object} config - 配置对象
 * @returns {Promise<Object|null>} 分组对象或 null
 */
export async function findGroupByOnlyName(onlyName, config = null) {
  try {
    return await getGroupInfo({ onlyName }, config);
  } catch (error) {
    // 如果通过 onlyName 查询失败，尝试从列表中查找
    try {
      const data = await getAllGroupsWithItems(config);
      if (data && Array.isArray(data.list)) {
        return data.list.find(group => group.onlyName === onlyName) || null;
      }
    } catch (e) {
      const groups = await getGroupList(config);
      if (groups && Array.isArray(groups.list)) {
        return groups.list.find(group => group.onlyName === onlyName) || null;
      }
    }
  }

  return null;
}

/**
 * 获取站点设置（内部 API）
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 站点设置
 */
export async function getSiteSettings(config = null) {
  const resolvedConfig = resolveConfig(config);
  const url = `${resolvedConfig.apiBase.replace('/openapi/v1', '')}/api/panel/globalSetting/getSiteStting`;
  const timeoutMs = 30000;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'token': resolvedConfig.apiToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(`API Error ${result.code}: ${result.msg}`);
  }

  return result.data;
}

/**
 * 获取用户信息（内部 API）
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 用户信息
 */
export async function getUserInfo(config = null) {
  const resolvedConfig = resolveConfig(config);
  const url = `${resolvedConfig.apiBase.replace('/openapi/v1', '')}/api/user/getAuthInfo`;
  const timeoutMs = 30000;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'token': resolvedConfig.apiToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(`API Error ${result.code}: ${result.msg}`);
  }

  return result.data;
}

// CLI 接口
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const command = process.argv[2];

  switch (command) {
    case 'test':
      await testConnection();
      break;

    case 'version':
      try {
        const version = await getVersion();
        console.log(`Sun Panel 版本: ${version.version} (code: ${version.versionCode})`);
      } catch (error) {
        console.error('获取版本失败:', error.message);
      }
      break;

    case 'groups':
      try {
        const groups = await getGroupList();
        console.log(`\n📁 分组列表 (共 ${groups.count} 个):\n`);
        groups.list.forEach(group => {
          console.log(`  [${group.itemGroupID}] ${group.title} (${group.onlyName})`);
        });
        console.log('');
      } catch (error) {
        console.error('获取分组列表失败:', error.message);
      }
      break;

    case 'info':
      const onlyName = process.argv[3];
      if (!onlyName) {
        console.error('用法: node sunpanel-api.mjs info <onlyName>');
        process.exit(1);
      }
      try {
        const item = await getItemInfo(onlyName);
        console.log(`\n📄 项目信息:\n`);
        console.log(`  标题: ${item.title}`);
        console.log(`  唯一标识: ${item.onlyName}`);
        console.log(`  URL: ${item.url}`);
        if (item.lanUrl) console.log(`  内网 URL: ${item.lanUrl}`);
        if (item.description) console.log(`  描述: ${item.description}`);
        if (item.iconUrl) console.log(`  图标: ${item.iconUrl}`);
        if (item.itemGroupID) console.log(`  分组 ID: ${item.itemGroupID}`);
        if (item.itemGroupOnlyName) console.log(`  分组标识: ${item.itemGroupOnlyName}`);
        console.log('');
      } catch (error) {
        console.error('获取项目信息失败:', error.message);
      }
      break;

    default:
      console.log(`
Sun Panel API 管理工具

用法:
  node sunpanel-api.mjs test                    # 测试连接
  node sunpanel-api.mjs version                 # 获取版本信息
  node sunpanel-api.mjs groups                  # 获取所有分组
  node sunpanel-api.mjs info <onlyName>         # 获取项目信息

示例:
  node sunpanel-api.mjs test
  node sunpanel-api.mjs groups
  node sunpanel-api.mjs info test_baidu
      `);
  }
}
