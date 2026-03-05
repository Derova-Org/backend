# backend/src/services/

Business logic layer — orchestrates crypto, ledger, and storage.

## Planned modules

- **account.ts** — Create account flow (generate key -> submit to Hedera -> persist)
- **transaction.ts** — Build, sign, and submit Hedera transactions
- **balance.ts** — Fetch and cache account balances from mirror node

## Reference — decentralized-login-development

| Derova service | Reference file | Reference functions / concepts |
|---|---|---|
| `account.ts` | `src/server/services/oprf.ts`, `src/server/routes/auth.ts` | `evaluate()` for OPRF; register flow orchestrates: check availability → OPRF eval → create ledger account → store user → issue challenge → verify signature → issue session |
| `transaction.ts` | *(no direct reference)* | New for Derova — reference only creates accounts, does not submit general transactions |
| `balance.ts` | *(no direct reference)* | New for Derova — reference has no balance/mirror-node queries |
