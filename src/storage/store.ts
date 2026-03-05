/**
 * Generic read/write JSON to data/ directory.
 *
 * Reference: decentralized-login-development/src/server/storage/serverSecrets.ts — loadOrCreate() pattern
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function dataPath(filename: string): string {
  return resolve(DATA_DIR, filename);
}

export function readJson<T>(filename: string): T | null {
  const path = dataPath(filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

export function writeJson<T>(filename: string, data: T): void {
  const path = dataPath(filename);
  ensureDir(path);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export function loadOrCreate<T>(filename: string, defaults: () => T): T {
  const existing = readJson<T>(filename);
  if (existing !== null) return existing;
  const data = defaults();
  writeJson(filename, data);
  return data;
}
