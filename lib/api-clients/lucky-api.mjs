#!/usr/bin/env node
/**
 * Lucky API 配置与请求封装
 */

import http from 'node:http';
import https from 'node:https';
import { getEnv } from '../utils/env-loader.mjs';

const DEFAULT_DOMAIN = 'leecaiy.shop';
const DEFAULT_ADMIN_API_BASE_URL = `https://lucky.${getEnv('ALIYUN_DOMAIN', DEFAULT_DOMAIN).trim() || DEFAULT_DOMAIN}:50000/666`;

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

export const API_BASE_URL = getApiBaseUrl();

export const PORT_WHITELIST = [50000, 8080, 8081, 50010];

export const PORT_WHITELIST_ENABLED = false;

export const withAdminToken = (url) => url;
export const withOpenToken = (url) => {
  const token = getOpenToken();
  if (!token) return url;

  const urlObj = new URL(url, getApiBaseUrl());
  urlObj.searchParams.set('openToken', token);
  return `${urlObj.pathname}${urlObj.search}`;
};

function buildAuthHeaders(options = {}) {
  const authMode = getLuckyAuthMode();
  if (authMode === 'open') {
    // OpenToken 模式：不添加 special header，token 会通过 URL 参数传递
    return {
      'Content-Type': 'application/json',
      ...options.headers
    };
  }

  if (authMode === 'admin') {
    return {
      'Content-Type': 'application/json',
      'lucky-admin-token': getAdminToken(),
      ...options.headers
    };
  }

  throw new Error('LUCKY_OPEN_TOKEN 或 LUCKY_ADMIN_TOKEN 环境变量未设置');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildRequestPath(url) {
  const authMode = getLuckyAuthMode();
  if (authMode !== 'open') {
    return url;
  }

  const urlObj = new URL(url, getApiBaseUrl());
  urlObj.searchParams.set('openToken', getOpenToken());
  return `${urlObj.pathname}${urlObj.search}`;
}

async function luckyFetch(url, options = {}) {
  const fullUrl = `${getApiBaseUrl()}${buildRequestPath(url)}`;
  const urlObj = new URL(fullUrl);
  const requestModule = urlObj.protocol === 'http:' ? http : https;
  const requestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'http:' ? 80 : 443),
    path: urlObj.pathname + urlObj.search,
    method: options.method || 'GET',
    headers: buildAuthHeaders(options)
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

export async function adminTokenFetch(url, options = {}) {
  return luckyFetch(url, options);
}

export async function openTokenFetch(url, options = {}) {
  return luckyFetch(url, options);
}
