import { query } from './db.js';

export interface AccountRecord {
  publicKeyHex: string;
  accountId: string;
  createdAt: string;
}

export async function accountExists(usernameHash: string): Promise<boolean> {
  const result = await query('SELECT 1 FROM accounts WHERE username_hash = $1', [usernameHash]);
  return result.rowCount !== null && result.rowCount > 0;
}

export async function createAccountRecord(
  usernameHash: string,
  publicKeyHex: string,
  accountId: string,
): Promise<void> {
  await query(
    'INSERT INTO accounts (username_hash, public_key_hex, account_id) VALUES ($1, $2, $3)',
    [usernameHash, publicKeyHex, accountId],
  );
}

export async function getAccountRecord(usernameHash: string): Promise<AccountRecord | undefined> {
  const result = await query<{ public_key_hex: string; account_id: string; created_at: Date }>(
    'SELECT public_key_hex, account_id, created_at FROM accounts WHERE username_hash = $1',
    [usernameHash],
  );
  if (result.rowCount === 0 || result.rowCount === null) return undefined;
  const row = result.rows[0];
  return {
    publicKeyHex: row.public_key_hex,
    accountId: row.account_id,
    createdAt: row.created_at.toISOString(),
  };
}

export async function clearAccounts(): Promise<void> {
  await query('DELETE FROM accounts');
}
