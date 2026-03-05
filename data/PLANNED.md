# backend/data/

Runtime data directory for JSON file storage. Contents are gitignored except this file.

## Reference — decentralized-login-development

| Derova data file | Reference file | Contents |
|---|---|---|
| `server-secrets.json` | `data/server-secrets.json` | `{oprfSeed, orgId}` — 256-bit OPRF master seed + 128-bit org identifier, generated on first run |
| `users.json` / `accounts.json` | `data/users.json`, `data/hedera-users.json` | Keyed by usernameHash → `{publicKeyHex, accountId, scheme}` |
| `transactions.json` | *(no direct reference)* | New for Derova — reference does not persist transaction logs |
