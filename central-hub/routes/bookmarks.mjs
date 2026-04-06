/**
 * 收藏/书签管理路由
 * 管理自定义外部页面收藏，并可同步到 SunPanel
 */

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, '..', '..');
const BOOKMARKS_PATH = path.resolve(PROJECT_ROOT, 'config', 'bookmarks.json');

function loadBookmarks() {
  try {
    const raw = fs.readFileSync(BOOKMARKS_PATH, 'utf8');
    return JSON.parse(raw).bookmarks || [];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks) {
  fs.writeFileSync(BOOKMARKS_PATH, JSON.stringify({ bookmarks }, null, 2) + '\n', 'utf8');
}

export default function bookmarkRoutes(modules) {
  const router = Router();

  // 列出所有收藏
  router.get('/list', (req, res) => {
    res.json(loadBookmarks());
  });

  // 添加收藏
  router.post('/add', (req, res) => {
    const { id, name, url, icon, group, description } = req.body;

    if (!id || !name || !url) {
      return res.status(400).json({ error: '缺少必填字段: id, name, url' });
    }

    const bookmarks = loadBookmarks();
    if (bookmarks.find(b => b.id === id)) {
      return res.status(409).json({ error: `收藏 ${id} 已存在` });
    }

    const bookmark = { id, name, url, icon: icon || '', group: group || '收藏', description: description || '' };
    bookmarks.push(bookmark);
    saveBookmarks(bookmarks);
    res.json({ success: true, bookmark });
  });

  // 更新收藏
  router.put('/:id', (req, res) => {
    const bookmarks = loadBookmarks();
    const index = bookmarks.findIndex(b => b.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: `收藏 ${req.params.id} 不存在` });
    }

    bookmarks[index] = { ...bookmarks[index], ...req.body, id: req.params.id };
    saveBookmarks(bookmarks);
    res.json({ success: true, bookmark: bookmarks[index] });
  });

  // 删除收藏
  router.delete('/:id', (req, res) => {
    const bookmarks = loadBookmarks();
    const filtered = bookmarks.filter(b => b.id !== req.params.id);

    if (filtered.length === bookmarks.length) {
      return res.status(404).json({ error: `收藏 ${req.params.id} 不存在` });
    }

    saveBookmarks(filtered);
    res.json({ success: true });
  });

  // 同步收藏到 SunPanel
  router.post('/sync', async (req, res) => {
    try {
      const bookmarks = loadBookmarks();
      const luckyManager = modules.luckyManager || modules.sunpanelManager;

      if (!luckyManager) {
        return res.status(503).json({ error: 'SunPanel 模块未启用' });
      }

      // 将收藏转换为 SunPanel 同步格式
      const { getGroupList, createGroup, createItem, updateItem, getItemInfo } = await import('../../lib/api-clients/sunpanel-api.mjs');
      const { getEnv } = await import('../../lib/utils/env-loader.mjs');

      // 从 luckyManager 的配置中读取 SunPanel 实例列表，或者回退到环境变量单实例
      const sunInstances = luckyManager.sunpanelConfig?.instances || [{
        apiBase: getEnv('SUNPANEL_API_BASE', 'http://192.168.3.200:20001/openapi/v1'),
        apiToken: getEnv('SUNPANEL_API_TOKEN', '')
      }];

      let synced = 0;

      for (let i = 0; i < sunInstances.length; i++) {
        const sunpanelConfig = sunInstances[i];
        console.log(`[Bookmarks] ➡️ 正在同步到 SunPanel 实例 ${i + 1} (${sunpanelConfig.apiBase})`);

        const groupsData = await getGroupList(sunpanelConfig);
        const groups = groupsData.list || [];
        const groupMap = new Map();
        groups.forEach(g => groupMap.set(g.onlyName, g.itemGroupID));

        for (const bm of bookmarks) {
          const groupOnlyName = (bm.group || '收藏').trim().toLowerCase().replace(/\s+/g, '-');
          let groupId = groupMap.get(groupOnlyName);

          if (!groupId) {
            try {
              const createdGroup = await createGroup({ title: bm.group || '收藏', onlyName: groupOnlyName }, sunpanelConfig);
              groupId = createdGroup?.itemGroupID;

              if (!groupId) {
                const refreshedGroups = await getGroupList(sunpanelConfig);
                const matchedGroup = (refreshedGroups.list || []).find(group => group.onlyName === groupOnlyName);
                groupId = matchedGroup?.itemGroupID;
              }

              if (!groupId) {
                throw new Error('未返回 itemGroupID');
              }

              groupMap.set(groupOnlyName, groupId);
              console.log(`[Bookmarks] ✅ [实例 ${i+1}] 创建分组: ${bm.group}`);
            } catch (error) {
              if (!error.message.includes('1202')) {
                console.error(`[Bookmarks] ⚠️ [实例 ${i+1}] 创建分组失败: ${bm.group} - ${error.message}`);
                continue;
              }
            }
          }

          const onlyName = `bm-${bm.id}`;
          const cardConfig = {
            title: bm.name,
            url: bm.url,
            onlyName,
            iconUrl: bm.icon || '',
            lanUrl: bm.url,
            description: bm.description || '',
            itemGroupID: groupId,
            itemGroupOnlyName: groupOnlyName,
            isSaveIcon: false
          };

          try {
            await getItemInfo(onlyName, sunpanelConfig);
            await updateItem({ onlyName, ...cardConfig }, sunpanelConfig);
          } catch (error) {
            if (error.message.includes('1203')) {
              await createItem(cardConfig, sunpanelConfig);
            } else {
              console.error(`[Bookmarks] ❌ [实例 ${i+1}] 同步失败: ${bm.name} - ${error.message}`);
              continue;
            }
          }
          if (i === 0) synced++; // 仅计算主节点成功的数量以不重复计数
        }
      }

      res.json({ success: true, total: bookmarks.length, synced });
    } catch (error) {
      console.error('[Bookmarks] 同步失败:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
