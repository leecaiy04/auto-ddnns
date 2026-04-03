#!/usr/bin/env node
/**
 * Sun Panel API 客户端
 * 用于管理 Sun Panel 的图标卡片和分组
 */

import { getEnv } from '../utils/env-loader.mjs';
import { pathToFileURL } from 'node:url';

const DEFAULT_API_BASE = 'http://192.168.3.200:20001/openapi/v1';

function normalizeApiBase(apiBase) {
  return `${apiBase || DEFAULT_API_BASE}`.replace(/\/+$/u, '');
}

function resolveConfig(config = null) {
  const overrides = config ?? {};

  return {
    apiBase: normalizeApiBase(overrides.apiBase ?? getEnv('SUNPANEL_API_BASE', DEFAULT_API_BASE)),
    apiToken: overrides.apiToken ?? getEnv('SUNPANEL_API_TOKEN', '')
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
 * @returns {Promise<object>} 响应数据
 */
async function callApi(endpoint, data = {}, config = null) {
  const resolvedConfig = resolveConfig(config);
  const url = `${resolvedConfig.apiBase}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'token': resolvedConfig.apiToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  const result = await response.json();

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
