#!/usr/bin/env node
/**
 * 环境变量加载工具
 * 支持从 .env 文件加载配置，并提供同步/异步两种调用方式
 */

import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_ENV_PATHS = [
  path.join(PROJECT_ROOT, '.env'),
  path.join(process.cwd(), '.env'),
  '/vol1/1000/code/auto-ddnns/.env'
];

function normalizeLoadOptions(envPathOrOptions = null) {
  if (typeof envPathOrOptions === 'string' || envPathOrOptions === null) {
    return {
      envPath: envPathOrOptions,
      searchPaths: [],
      mutateProcessEnv: true
    };
  }

  return {
    envPath: envPathOrOptions.envPath ?? null,
    searchPaths: envPathOrOptions.searchPaths ?? [],
    mutateProcessEnv: envPathOrOptions.mutateProcessEnv ?? true
  };
}

function stripQuotes(value) {
  if (value.length < 2) {
    return value;
  }

  const startsWithQuote = value.startsWith('"') || value.startsWith("'");
  const endsWithQuote = value.endsWith('"') || value.endsWith("'");

  if (startsWithQuote && endsWithQuote && value[0] === value.at(-1)) {
    return value.slice(1, -1);
  }

  return value;
}

export function parseEnvContent(content) {
  const env = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key) {
      env[key] = stripQuotes(value);
    }
  }

  return env;
}

export function getEnvSearchPaths(envPathOrOptions = null) {
  const { envPath, searchPaths } = normalizeLoadOptions(envPathOrOptions);
  const candidates = envPath ? [envPath] : [...searchPaths, ...DEFAULT_ENV_PATHS];

  return [...new Set(candidates.filter(Boolean))];
}

function applyEnv(env, mutateProcessEnv) {
  if (mutateProcessEnv) {
    // Only set env vars that don't already exist (PM2 env vars take precedence)
    for (const [key, value] of Object.entries(env)) {
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }

  return env;
}

export function loadEnvFile(envPathOrOptions = null) {
  const { mutateProcessEnv } = normalizeLoadOptions(envPathOrOptions);

  for (const filePath of getEnvSearchPaths(envPathOrOptions)) {
    try {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const env = parseEnvContent(content);
      return applyEnv(env, mutateProcessEnv);
    } catch (error) {
      continue;
    }
  }

  return {};
}

export async function loadEnvFileAsync(envPathOrOptions = null) {
  const { mutateProcessEnv } = normalizeLoadOptions(envPathOrOptions);

  for (const filePath of getEnvSearchPaths(envPathOrOptions)) {
    try {
      const content = await readFile(filePath, 'utf-8');
      const env = parseEnvContent(content);
      return applyEnv(env, mutateProcessEnv);
    } catch (error) {
      continue;
    }
  }

  return {};
}

/**
 * 获取环境变量（支持默认值）
 */
export function getEnv(key, defaultValue = null) {
  return process.env[key] || defaultValue;
}

/**
 * 检查必需的环境变量
 */
export function checkRequiredEnv(requiredKeys) {
  const missing = [];

  for (const key of requiredKeys) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`缺少必需的环境变量: ${missing.join(', ')}`);
  }
}

loadEnvFile();
