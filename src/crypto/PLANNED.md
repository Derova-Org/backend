# backend/src/crypto/

Server-side cryptographic operations.

## Planned modules

- **keys.ts** — Ed25519 key-pair management (generate, load from env/file)
- **sign.ts** — Transaction and message signing for Hedera submissions
- **verify.ts** — Verify client-supplied signatures before relaying

## Reference — decentralized-login-development

| Derova module | Reference file | Reference functions / concepts |
|---|---|---|
| `keys.ts` | `src/server/storage/serverSecrets.ts` | `loadOrCreate()` — generates/persists OPRF seed + orgId; `deriveOprfKey()` derives per-client keys via HMAC-SHA512 |
| `sign.ts` | `src/shared/crypto.ts` | `oprfEvaluate(serverSecret, blindedHex)` — server-side OPRF scalar multiplication on blinded point |
| `verify.ts` | `src/shared/crypto.ts` | `verifySignature(signature, challenge, publicKey, scheme)` — Ed25519 verification of client challenge response |
