# backend/src/routes/

Express route handlers.

## Planned routes

- **health.ts** — `GET /health` liveness check
- **accounts.ts** — `POST /accounts` create Hedera account, `GET /accounts/:id` lookup
- **transactions.ts** — `POST /transactions` submit signed transaction to Hedera
- **balances.ts** — `GET /balances/:accountId` mirror-node balance query

## Reference — decentralized-login-development

| Derova route | Reference file | Reference endpoints / concepts |
|---|---|---|
| `health.ts` | *(no direct reference)* | New for Derova — liveness probe for containerized deployment |
| `accounts.ts` | `src/server/routes/auth.ts` | `POST /register/init` (check availability), `POST /register/oprf` (OPRF eval), `POST /register/complete` (create account + store pubkey), `POST /register/verify` (challenge verify + session) |
| `transactions.ts` | *(no direct reference)* | New for Derova — reference only does auth, not general Hedera transaction submission |
| `balances.ts` | *(no direct reference)* | New for Derova — reference has no balance queries; will wrap mirror node REST API |
