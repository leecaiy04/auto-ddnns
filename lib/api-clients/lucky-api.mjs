#!/usr/bin/env node
/**
 * Lucky API 配置与请求封装
 */

import https from 'node:https';
import { getEnv } from '../utils/env-loader.mjs';

const DEFAULT_API_BASE_URL = 'https://lucky.leecaiy.xyz:50000/666';

const getApiBaseUrl = () => getEnv('LUCKY_API_BASE', DEFAULT_API_BASE_URL);

export const API_BASE_URL = getApiBaseUrl();

export const getAdminToken = () =>
  getEnv('LUCKY_ADMIN_TOKEN', getEnv('LUCKY_OPEN_TOKEN', ''));

export const PORT_WHITELIST = [50000, 8080, 8081, 50010];

export const PORT_WHITELIST_ENABLED = false;

export const withAdminToken = (url) => url;

export async function adminTokenFetch(url, options = {}) {
  const token = getAdminToken();
  if (!token) {
    throw new Error('LUCKY_ADMIN_TOKEN 或 LUCKY_OPEN_TOKEN 环境变量未设置');
  }

  const headers = {
    'Content-Type': 'application/json',
    'lucky-admin-token': token,
    ...options.headers
  };

  const fullUrl = `${getApiBaseUrl()}${url}`;
  const urlObj = new URL(fullUrl);
  const requestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || 443,
    path: urlObj.pathname + urlObj.search,
    method: options.method || 'GET',
    headers,
    rejectUnauthorized: false
  };

  const requestBody = options.body ? JSON.stringify(options.body) : undefined;

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`HTTP Error ${res.statusCode}: ${res.statusMessage}`));
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
}

export const withOpenToken = withAdminToken;
export const openTokenFetch = adminTokenFetch;
