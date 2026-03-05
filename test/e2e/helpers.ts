/**
 * E2E test helpers — HTTP client + crypto flow drivers.
 *
 * Exercises the full OPRF registration/login flow against a running backend.
 */

import type { Server } from 'node:http';
import { createApp } from '../../src/index.js';
import { runMigrations } from '../../src/storage/migrate.js';
import { closePool, query } from '../../src/storage/db.js';
import {
  blindPassword,
  finalizeOprf,
  deriveKeypair,
  signChallenge,
  bytesToHex,
  hexToBytes,
  ARGON2_DEV,
} from '@derova/sdk';

let server: Server;
let baseUrl: string = '';

/** Get the running server's base URL. */
export function getServerUrl(): string {
  return baseUrl;
}

/** Boot the Express app on a random port with migrations run. */
export async function startServer(): Promise<string> {
  await runMigrations();
  const app = createApp();
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve(baseUrl);
    });
  });
}

/** Shut down the server and close DB pool. */
export async function stopServer(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await closePool();
}

/** Truncate all test data between tests. */
export async function cleanDb(): Promise<void> {
  await query('DELETE FROM accounts');
  await query('DELETE FROM server_secrets');
}

/** POST JSON to a backend endpoint. */
export async function post(path: string, body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

/** GET a backend endpoint. */
export async function get(path: string, headers?: Record<string, string>): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  return { status: res.status, body: await res.json() };
}

/**
 * Drive the full registration flow for a user.
 * Returns the session token and keypair info.
 */
export async function registerUser(username: string, password: string): Promise<{
  token: string;
  publicKeyHex: string;
  privateKey: Uint8Array;
}> {
  // Step 1: Check availability
  const initRes = await post('/accounts/register/init', { username });
  if (initRes.status !== 200 || !initRes.body.available) {
    throw new Error(`register/init failed: ${JSON.stringify(initRes)}`);
  }

  // Step 2: OPRF evaluation
  const { blindedHex, blind } = blindPassword(password);
  const oprfRes = await post('/accounts/register/oprf', { username, blindedHex });
  if (oprfRes.status !== 200) {
    throw new Error(`register/oprf failed: ${JSON.stringify(oprfRes)}`);
  }
  const { evaluatedHex, orgId } = oprfRes.body;

  // Step 3: Finalize OPRF and derive keypair
  const oprfOutput = finalizeOprf(evaluatedHex, blind);
  const { publicKey, privateKey } = deriveKeypair(oprfOutput, username, orgId, ARGON2_DEV);
  const publicKeyHex = bytesToHex(publicKey);

  // Step 4: Complete registration (pass a fake accountId to skip Hedera)
  const completeRes = await post('/accounts/register/complete', {
    username,
    publicKeyHex,
    accountId: '0.0.99999',
  });
  if (completeRes.status !== 200) {
    throw new Error(`register/complete failed: ${JSON.stringify(completeRes)}`);
  }
  const { challengeHex } = completeRes.body;

  // Step 5: Sign the challenge and verify
  const signature = signChallenge(hexToBytes(challengeHex), privateKey);
  const verifyRes = await post('/accounts/register/verify', {
    username,
    signatureHex: bytesToHex(signature),
  });
  if (verifyRes.status !== 200) {
    throw new Error(`register/verify failed: ${JSON.stringify(verifyRes)}`);
  }

  return { token: verifyRes.body.token, publicKeyHex, privateKey };
}

/**
 * Drive the full login flow for an already-registered user.
 * Returns the session token and accountId.
 */
export async function loginUser(username: string, password: string): Promise<{
  token: string;
  accountId: string;
}> {
  // Step 1: OPRF evaluation + challenge
  const { blindedHex, blind } = blindPassword(password);
  const oprfRes = await post('/accounts/login/oprf', { username, blindedHex });
  if (oprfRes.status !== 200) {
    throw new Error(`login/oprf failed: ${JSON.stringify(oprfRes)}`);
  }
  const { evaluatedHex, orgId, challengeHex } = oprfRes.body;

  // Step 2: Finalize OPRF and derive keypair (same as registration)
  const oprfOutput = finalizeOprf(evaluatedHex, blind);
  const { privateKey } = deriveKeypair(oprfOutput, username, orgId, ARGON2_DEV);

  // Step 3: Sign challenge and verify
  const signature = signChallenge(hexToBytes(challengeHex), privateKey);
  const verifyRes = await post('/accounts/login/verify', {
    username,
    signatureHex: bytesToHex(signature),
  });
  if (verifyRes.status !== 200) {
    throw new Error(`login/verify failed: ${JSON.stringify(verifyRes)}`);
  }

  return { token: verifyRes.body.token, accountId: verifyRes.body.accountId };
}
