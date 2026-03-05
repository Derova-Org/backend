/**
 * Mirror node REST queries (balances, token info, tx history).
 *
 * New for Derova — the reference project has no mirror node integration.
 */

const MIRROR_URLS: Record<string, string> = {
  testnet: 'https://testnet.mirrornode.hedera.com',
  mainnet: 'https://mainnet.mirrornode.hedera.com',
};

export interface AccountBalance {
  account: string;
  balance: number;
  tokens: Array<{ token_id: string; balance: number }>;
}

export async function getAccountBalance(
  accountId: string,
  network: 'testnet' | 'mainnet' = 'testnet',
): Promise<AccountBalance> {
  const base = MIRROR_URLS[network];
  const params = new URLSearchParams({ 'account.id': accountId, limit: '1' });
  const res = await fetch(`${base}/api/v1/balances?${params}`);
  if (!res.ok) {
    throw new Error(`Mirror node balance query failed: ${res.status}`);
  }
  const data = await res.json();
  const entry = data.balances?.[0];
  if (!entry) {
    throw new Error(`No balance found for account ${accountId}`);
  }
  return {
    account: entry.account,
    balance: entry.balance,
    tokens: entry.tokens ?? [],
  };
}

export interface TransactionRecord {
  transaction_id: string;
  name: string;
  result: string;
  consensus_timestamp: string;
}

export async function getTransactionHistory(
  accountId: string,
  network: 'testnet' | 'mainnet' = 'testnet',
  limit = 25,
): Promise<TransactionRecord[]> {
  const base = MIRROR_URLS[network];
  const params = new URLSearchParams({
    'account.id': accountId,
    limit: String(limit),
    order: 'desc',
  });
  const res = await fetch(`${base}/api/v1/transactions?${params}`);
  if (!res.ok) {
    throw new Error(`Mirror node transaction query failed: ${res.status}`);
  }
  const data = await res.json();
  return (data.transactions ?? []).map((tx: any) => ({
    transaction_id: tx.transaction_id,
    name: tx.name,
    result: tx.result,
    consensus_timestamp: tx.consensus_timestamp,
  }));
}
