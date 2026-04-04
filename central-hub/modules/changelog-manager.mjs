/**
 * 变更日志管理模块
 * 记录所有手动配置变更操作，便于审计和复原
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHANGELOG_PATH = path.resolve(__dirname, '..', '..', 'config', 'changelog.json');
const MAX_ENTRIES = 500;

export class ChangelogManager {
  constructor() {
    this.entries = [];
    this.filePath = CHANGELOG_PATH;
  }

  async init() {
    console.log('[Changelog] 初始化变更日志模块...');
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(content);
      this.entries = data.entries || [];
    } catch {
      this.entries = [];
    }
    console.log(`[Changelog] ✅ 已加载 ${this.entries.length} 条变更记录`);
  }

  /**
   * 追加一条变更记录
   * @param {string} action - 操作类型 (add_service, update_service, delete_service, purge, scan, etc.)
   * @param {string} target - 操作目标 (service id, device id, etc.)
   * @param {string} detail - 详细描述
   * @param {object} [data] - 可选的附加数据（如变更前后的值）
   */
  append(action, target, detail, data = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      target,
      detail,
      user: 'admin'
    };

    if (data) {
      entry.data = data;
    }

    this.entries.push(entry);

    // 保持条目数量在上限内
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }

    this._save();
    return entry;
  }

  /**
   * 获取所有记录（支持筛选）
   * @param {object} [filter] - 筛选条件
   * @param {string} [filter.action] - 按操作类型筛选
   * @param {string} [filter.target] - 按目标筛选
   * @param {number} [filter.limit] - 最大返回数
   * @param {number} [filter.offset] - 偏移量
   */
  getAll(filter = {}) {
    let result = [...this.entries];

    if (filter.action) {
      result = result.filter(e => e.action === filter.action);
    }
    if (filter.target) {
      result = result.filter(e => e.target === filter.target);
    }

    // 最新的在前
    result.reverse();

    const total = result.length;
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    result = result.slice(offset, offset + limit);

    return { total, offset, limit, entries: result };
  }

  /**
   * 导出 JSON
   */
  exportJSON() {
    return { entries: this.entries };
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify({ entries: this.entries }, null, 2));
    } catch (error) {
      console.error('[Changelog] ❌ 保存变更日志失败:', error.message);
    }
  }
}

export default ChangelogManager;
