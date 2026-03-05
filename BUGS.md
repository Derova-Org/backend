# Backend — Known Bugs & Issues

## Critical

- **`getClient()` singleton ignores network param after first call** — if called with `'testnet'` then `'mainnet'`, the second call silently returns the testnet client. Needs separate singletons per network or explicit switching. (`ledger/client.ts:12`)

## High

- **Empty catch block in logout endpoint** — if `sessionLogout()` throws, no response is sent and the client hangs. (`routes/accounts.ts:114`)
- **Zero test files** — `test/` only contains `PLANNED.md`. No automated verification of auth flows, registration, or balance queries.

## Medium

- **CORS allows all origins** — `app.use(cors())` with no origin restriction. Should whitelist allowed origins. (`index.ts:8`)
- **URL parameter injection in mirror node queries** — `accountId` and `limit` are interpolated directly into URLs without encoding. Use `URLSearchParams` instead. (`ledger/mirror.ts:23`, `ledger/mirror.ts:52-53`)
- **No input validation on usernames** — `hashUsername()` accepts empty strings, extremely long strings, etc. (`services/account.ts:31`)
- **No input validation on publicKeyHex** — passed directly to Hedera SDK without format/length check. (`routes/accounts.ts:50-57`)
- **All errors in register/complete return 409** — network errors, invalid keys, and duplicate usernames all get the same status code. (`routes/accounts.ts:60`)
- **Raw error messages leak implementation details** — `e.message` returned directly to clients in multiple routes. (`routes/accounts.ts:45`, `routes/balances.ts:28`)
- **Expired challenges accumulate in memory** — cleanup is lazy (only on consume). Should add periodic sweep. (`services/account.ts:46-61`)
- **Balance cache doesn't handle fetch failures** — if `getAccountBalance()` throws, cache is never set and every retry hits the network. (`services/balance.ts:23`)

## Low

- **Dockerfile lacks version pinning and health check** — uses `node:22-slim` without a specific patch version. No `HEALTHCHECK` instruction. (`Dockerfile:1,9`)
