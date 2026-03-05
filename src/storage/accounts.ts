/**
 * Account records CRUD (accountId, publicKey, createdAt).
 *
 * Reference: decentralized-login-development/src/server/storage/userStore.ts
 */

import { readJson, writeJson } from './store.js';

const FILENAME = 'accounts.json';

export interface AccountRecord {
  publicKeyHex: string;
  accountId: string;
  createdAt: string;
}

type AccountStore = Record<string, AccountRecord>;

function load(): Map<string, AccountRecord> {
  const raw = readJson<AccountStore>(FILENAME);
  return raw ? new Map(Object.entries(raw)) : new Map();
}

function save(accounts: Map<string, AccountRecord>) {
  writeJson(FILENAME, Object.fromEntries(accounts));
}

const accounts = load();

export function accountExists(usernameHash: string): boolean {
  return accounts.has(usernameHash);
}

export function createAccountRecord(
  usernameHash: string,
  publicKeyHex: string,
  accountId: string,
): void {
  accounts.set(usernameHash, {
    publicKeyHex,
    accountId,
    createdAt: new Date().toISOString(),
  });
  save(accounts);
}

export function getAccountRecord(usernameHash: string): AccountRecord | undefined {
  return accounts.get(usernameHash);
}

export function clearAccounts(): void {
  accounts.clear();
  save(accounts);
}
