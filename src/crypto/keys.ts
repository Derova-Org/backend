/**
 * Server secret management — OPRF seed and org ID persistence.
 *
 * Reference: decentralized-login-development/src/server/storage/serverSecrets.ts
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateServerSecret, scalarToHex, hexToScalar, randomBytes, bytesToHex } from '@derova/sdk';
import logger from '../logger.js';

const SECRETS_PATH = resolve(import.meta.dirname, '../../data/server-secrets.json');

export interface ServerSecrets {
  oprfSeed: bigint;
  orgId: string;
}

let cached: ServerSecrets | null = null;

function ensureDir() {
  const dir = dirname(SECRETS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function getSecrets(): ServerSecrets {
  if (cached) return cached;

  if (existsSync(SECRETS_PATH)) {
    const raw = JSON.parse(readFileSync(SECRETS_PATH, 'utf-8'));
    cached = {
      oprfSeed: hexToScalar(raw.oprfSeed),
      orgId: raw.orgId,
    };
  } else {
    cached = {
      oprfSeed: generateServerSecret(),
      orgId: bytesToHex(randomBytes(16)),
    };
    ensureDir();
    writeFileSync(
      SECRETS_PATH,
      JSON.stringify(
        { oprfSeed: scalarToHex(cached.oprfSeed), orgId: cached.orgId },
        null,
        2,
      ),
    );
    logger.info({ path: SECRETS_PATH }, 'Generated new server secrets');
  }

  return cached;
}
