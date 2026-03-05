# backend/src/ledger/

Hedera network interaction via @hashgraph/sdk.

## Planned modules

- **client.ts** — Initialize and configure Hedera Client (testnet/mainnet)
- **submit.ts** — Execute transactions and return receipts/records
- **mirror.ts** — Mirror node REST queries (balances, token info, tx history)

## Reference — decentralized-login-development

| Derova module | Reference file | Reference functions / concepts |
|---|---|---|
| `client.ts` | `src/server/ledger/hederaLedger.ts` | `Client.forTestnet()`, operator set from env `HEDERA_OPERATOR_ID` + `HEDERA_OPERATOR_KEY`; funder account `0.0.3682442` |
| `submit.ts` | `src/server/ledger/hederaLedger.ts` | `createAccount(publicKeyHex)` — `AccountCreateTransaction` with 1 HBAR initial balance, returns `accountId` string |
| `mirror.ts` | *(no direct reference)* | New for Derova — reference only creates accounts; mirror node queries (balances, token info, tx history) are a Derova addition |
