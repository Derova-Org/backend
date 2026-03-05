export { readJson, writeJson, loadOrCreate } from './store.js';
export { getPool, query, closePool } from './db.js';
export { runMigrations } from './migrate.js';
export type { AccountRecord } from './accounts.js';

import type { AccountRecord } from './accounts.js';
import * as fileBacked from './accounts.js';
import * as pgBacked from './accounts-pg.js';

const usePg = !!process.env.DATABASE_URL;

export async function accountExists(usernameHash: string): Promise<boolean> {
  if (usePg) return pgBacked.accountExists(usernameHash);
  return fileBacked.accountExists(usernameHash);
}

export async function createAccountRecord(
  usernameHash: string,
  publicKeyHex: string,
  accountId: string,
): Promise<void> {
  if (usePg) return pgBacked.createAccountRecord(usernameHash, publicKeyHex, accountId);
  return fileBacked.createAccountRecord(usernameHash, publicKeyHex, accountId);
}

export async function getAccountRecord(
  usernameHash: string,
): Promise<AccountRecord | undefined> {
  if (usePg) return pgBacked.getAccountRecord(usernameHash);
  return fileBacked.getAccountRecord(usernameHash);
}

export async function clearAccounts(): Promise<void> {
  if (usePg) return pgBacked.clearAccounts();
  return fileBacked.clearAccounts();
}
