#!/usr/bin/env node
/**
 * Lucky API 配置与请求封装
 */

import http from 'node:http';
import https from 'node:https';
import { getEnv } from '../utils/env-loader.mjs';

const DEFAULT_ADMIN_API_BASE_URL = 'http://192.168.3.2:16601/666';

export const PORT_WHITELIST = [50000, 8080, 8081, 50010];

export const PORT_WHITELIST_ENABLED = false;

// ── env-backed helpers (kept for backward compatibility and CLI usage) ──

export const getOpenToken = () => getEnv('LUCKY_OPEN_TOKEN', '').trim();
export const getAdminToken = () => getEnv('LUCKY_ADMIN_TOKEN', '').trim();

export const getLuckyAuthMode = () => {
  if (getOpenToken()) return 'open';
  if (getAdminToken()) return 'admin';
  return 'none';
};

export const getApiBaseUrl = () => {
  const configuredBase = getEnv('LUCKY_API_BASE', '').trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, '');
  }
  return DEFAULT_ADMIN_API_BASE_URL;
};

/** @deprecated Use resolveConfig() + per-call config instead */
export const API_BASE_URL = getApiBaseUrl();

// ── config-resolution helpers ──

function normalizeApiBase(apiBase) {
  return `${apiBase || ''}`.trim().replace(/\/+$/u, '');
}

function resolveConfig(config = null) {
  const overrides = config ?? {};

  const apiBase = normalizeApiBase(overrides.apiBase) || getApiBaseUrl();
  const openToken = overrides.openToken !== undefined
    ? `${overrides.openToken}`.trim()
    : getOpenToken();
  const adminToken = overrides.adminToken !== undefined
    ? `${overrides.adminToken}`.trim()
    : getAdminToken();

  let authMode = 'none';
  if (openToken) authMode = 'open';
  else if (adminToken) authMode = 'admin';

  return { apiBase, openToken, adminToken, authMode };
}

export function getLuckyAuthConfig(config = null) {
  const resolved = resolveConfig(config);
  return {
    apiBase: resolved.apiBase,
    authMode: resolved.authMode,
    hasOpenToken: Boolean(resolved.openToken),
    hasAdminToken: Boolean(resolved.adminToken)
  };
}

// ── internal request helpers ──

function buildAuthHeaders(resolvedConfig, options = {}) {
  const { authMode, adminToken } = resolvedConfig;

  if (authMode === 'open') {
    return {
      'Content-Type': 'application/json',
      ...options.headers
    };
  }

  if (authMode === 'admin') {
    return {
      'Content-Type': 'application/json',
      'lucky-admin-token': adminToken,
      ...options.headers
    };
  }

  throw new Error('LUCKY_OPEN_TOKEN 或 LUCKY_ADMIN_TOKEN 未配置');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildRequestPath(url, resolvedConfig) {
  const { authMode, openToken } = resolvedConfig;

  if (authMode !== 'open') {
    return url;
  }

  const urlObj = new URL(url, resolvedConfig.apiBase);
  if (openToken) {
    urlObj.searchParams.set('openToken', openToken);
  }
  return `${urlObj.pathname}${urlObj.search}`;
}

async function luckyFetch(url, options = {}, config = null) {
  const resolvedConfig = resolveConfig(config);
  const fullUrl = `${resolvedConfig.apiBase}${buildRequestPath(url, resolvedConfig)}`;
  const urlObj = new URL(fullUrl);
  const requestModule = urlObj.protocol === 'http:' ? http : https;
  const requestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'http:' ? 80 : 443),
    path: urlObj.pathname + urlObj.search,
    method: options.method || 'GET',
    headers: buildAuthHeaders(resolvedConfig, options)
  };

  if (urlObj.protocol === 'https:') {
    requestOptions.rejectUnauthorized = false;
  }

  const requestBody = typeof options.body === 'string'
    ? options.body
    : options.body
      ? JSON.stringify(options.body)
      : undefined;

  const maxRetries = options.maxRetries ?? 4;
  const baseRetryDelay = options.baseRetryDelay ?? 350;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const req = requestModule.request(requestOptions, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              if ((res.statusCode || 500) >= 400) {
                const error = new Error(`HTTP Error ${res.statusCode}: ${res.statusMessage}`);
                error.statusCode = res.statusCode;
                error.responseText = data;
                reject(error);
                return;
              }

              resolve(JSON.parse(data));
            } catch (error) {
              reject(error);
            }
          });
        });

        req.on('error', reject);

        if (requestBody) {
          req.write(requestBody);
        }

        req.end();
      });
    } catch (error) {
      if (error?.statusCode === 429 && attempt < maxRetries) {
        await sleep(baseRetryDelay * (attempt + 1));
        continue;
      }

      throw error;
    }
  }
}

export async function adminTokenFetch(url, options = {}, config = null) {
  return luckyFetch(url, options, config);
}

export async function openTokenFetch(url, options = {}, config = null) {
  return luckyFetch(url, options, config);
}
