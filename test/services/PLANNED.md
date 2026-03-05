# backend/test/services/

Integration tests using node:test.

## Planned tests

- **account.test.ts** — Account creation end-to-end (mock Hedera client)
- **transaction.test.ts** — Transaction build + submit flow
- **balance.test.ts** — Balance fetch and caching

## Reference — decentralized-login-development

| Derova test | Reference file | What it covers in reference |
|---|---|---|
| `account.test.ts` | `test/e2e.test.ts`, `test/attacks.test.ts` | Full register→login cycle; duplicate username rejection; wrong password rejection; replay/forgery/cross-org attack resistance |
| `transaction.test.ts` | *(no direct reference)* | New for Derova — reference does not test general transaction submission |
| `balance.test.ts` | *(no direct reference)* | New for Derova — reference has no balance queries to test |
