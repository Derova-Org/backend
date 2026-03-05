# backend/src/storage/

Local persistence layer (JSON files in `data/`).

## Planned modules

- **store.ts** — Generic read/write JSON to `data/` directory
- **accounts.ts** — Account records CRUD (accountId, publicKey, createdAt)
- **transactions.ts** — Transaction log append and query

## Reference — decentralized-login-development

| Derova module | Reference file | Reference functions / concepts |
|---|---|---|
| `store.ts` | `src/server/storage/serverSecrets.ts` | `loadOrCreate()` pattern — read JSON from `data/`, create with defaults if missing, write back; used for `server-secrets.json` |
| `accounts.ts` | `src/server/storage/userStore.ts`, `src/server/storage/hederaUserStore.ts` | `save(usernameHash, {publicKeyHex, accountId, scheme})`, `find(usernameHash)` — keyed by HMAC-hashed username; persists to `data/users.json` |
| `transactions.ts` | *(no direct reference)* | New for Derova — reference does not log transactions; will append and query transaction records |
