/**
 * Initialize and configure Hedera Client (testnet/mainnet).
 *
 * Reference: decentralized-login-development/src/server/ledger/hederaLedger.ts
 */

import { Client, PrivateKey } from '@hashgraph/sdk';

const _clients: Partial<Record<HederaNetwork, Client>> = {};

export type HederaNetwork = 'testnet' | 'mainnet';

export function getClient(network: HederaNetwork = 'testnet'): Client {
  if (_clients[network]) return _clients[network]!;

  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      'Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY environment variables',
    );
  }

  const client =
    network === 'mainnet'
      ? Client.forMainnet()
      : Client.forTestnet();

  client.setOperator(operatorId, PrivateKey.fromStringDer(operatorKey));
  _clients[network] = client;
  return client;
}

export function closeClient(network?: HederaNetwork): void {
  if (network) {
    if (_clients[network]) {
      _clients[network]!.close();
      delete _clients[network];
    }
  } else {
    for (const net of Object.keys(_clients) as HederaNetwork[]) {
      _clients[net]!.close();
      delete _clients[net];
    }
  }
}
