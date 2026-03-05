/**
 * Fetch and cache account balances from mirror node.
 *
 * New for Derova — the reference project has no balance queries.
 */

import { getAccountBalance, type AccountBalance } from '../ledger/mirror.js';

const cache = new Map<string, { data: AccountBalance; expiresAt: number }>();
const CACHE_TTL_MS = 15_000;

export async function fetchBalance(
  accountId: string,
  network: 'testnet' | 'mainnet' = 'testnet',
): Promise<AccountBalance> {
  const cacheKey = `${network}:${accountId}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  try {
    const data = await getAccountBalance(accountId, network);
    cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    // Return stale cached data if available; otherwise re-throw
    if (cached) return cached.data;
    throw err;
  }
}
