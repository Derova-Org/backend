/**
 * Execute transactions and return receipts/records.
 *
 * Reference: decentralized-login-development/src/server/ledger/hederaLedger.ts — createAccount()
 */

import {
  AccountCreateTransaction,
  Hbar,
  PublicKey,
  type Client,
  type TransactionReceipt,
} from '@hashgraph/sdk';

export async function createAccount(
  client: Client,
  publicKeyHex: string,
  initialBalance = 1,
): Promise<string> {
  const userKey = PublicKey.fromStringED25519(publicKeyHex);

  const tx = new AccountCreateTransaction()
    .setKeyWithoutAlias(userKey)
    .setInitialBalance(new Hbar(initialBalance));

  const response = await tx.execute(client);
  const receipt: TransactionReceipt = await response.getReceipt(client);

  if (!receipt.accountId) {
    throw new Error('Hedera account creation failed — no account ID in receipt');
  }

  return receipt.accountId.toString();
}
