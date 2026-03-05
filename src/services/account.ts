/**
 * Account creation flow: generate key → submit to Hedera → persist.
 *
 * Reference: decentralized-login-development/src/server/services/oprf.ts,
 *            decentralized-login-development/src/server/routes/auth.ts
 */

import jwt from 'jsonwebtoken';
import { getSecrets, deriveOprfKey, oprfEvaluate } from '../crypto';
import { verifySignature, hashUsername as sdkHashUsername, randomBytes, bytesToHex, hexToBytes } from '@derova/sdk';
import { accountExists, createAccountRecord, getAccountRecord, type AccountRecord } from '../storage';
import logger from '../logger.js';

// ---------------------------------------------------------------------------
// Username hashing — delegates to SDK with server-managed HMAC key
// ---------------------------------------------------------------------------

let hmacKey: Uint8Array | null = null;

function getHmacKey(): Uint8Array {
  if (hmacKey) return hmacKey;
  const envKey = process.env.HMAC_KEY;
  if (envKey) {
    if (envKey.length !== 64) throw new Error('HMAC_KEY must be a 64-character hex string');
    hmacKey = hexToBytes(envKey);
    return hmacKey;
  }
  hmacKey = randomBytes(32);
  logger.warn({ key: bytesToHex(hmacKey) }, '[account] No HMAC_KEY set — generated ephemeral key');
  return hmacKey;
}

export function hashUsername(raw: string): string {
  return sdkHashUsername(raw, getHmacKey());
}

// ---------------------------------------------------------------------------
// Challenge management
// ---------------------------------------------------------------------------

const CHALLENGE_TTL_MS = 60_000;

interface PendingChallenge {
  challengeHex: string;
  expiresAt: number;
}

const challenges = new Map<string, PendingChallenge>();

export function issueChallenge(usernameHash: string): string {
  const challenge = randomBytes(32);
  const challengeHex = bytesToHex(challenge);
  challenges.set(usernameHash, { challengeHex, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  return challengeHex;
}

const SWEEP_INTERVAL_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of challenges) {
    if (now > entry.expiresAt) challenges.delete(key);
  }
}, SWEEP_INTERVAL_MS).unref();

export function consumeChallenge(usernameHash: string): string | null {
  const entry = challenges.get(usernameHash);
  if (!entry) return null;
  challenges.delete(usernameHash);
  if (Date.now() > entry.expiresAt) return null;
  return entry.challengeHex;
}

// ---------------------------------------------------------------------------
// Session management (stateless JWT)
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_EXPIRY_SECONDS = parseInt(process.env.SESSION_EXPIRY_SECONDS || '86400', 10);

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET env var is required in production');
}

const jwtSecret = JWT_SECRET || 'dev-secret-do-not-use-in-production';

export function createSession(usernameHash: string): string {
  return jwt.sign({ sub: usernameHash }, jwtSecret, { expiresIn: SESSION_EXPIRY_SECONDS });
}

export function isValidSession(token: string): boolean {
  try {
    jwt.verify(token, jwtSecret);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Registration flow
// ---------------------------------------------------------------------------

export async function checkAvailability(username: string): Promise<{ available: boolean }> {
  const hash = hashUsername(username);
  return { available: !(await accountExists(hash)) };
}

export async function evaluateOprf(username: string, blindedHex: string): Promise<{
  evaluatedHex: string;
  orgId: string;
}> {
  const { oprfSeed, orgId } = await getSecrets();
  const hash = hashUsername(username);
  const clientKey = deriveOprfKey(oprfSeed, hash);
  const evaluatedHex = oprfEvaluate(clientKey, blindedHex);
  return { evaluatedHex, orgId };
}

export async function completeRegistration(
  username: string,
  publicKeyHex: string,
  accountId: string,
): Promise<{ challengeHex: string }> {
  const hash = hashUsername(username);
  if (await accountExists(hash)) {
    throw new Error('Username already taken');
  }
  await createAccountRecord(hash, publicKeyHex, accountId);
  const challengeHex = issueChallenge(hash);
  return { challengeHex };
}

/** Consume challenge, verify signature, return session + account record */
async function verifyChallengeSignature(
  username: string,
  signatureHex: string,
): Promise<{ token: string; record: AccountRecord }> {
  const hash = hashUsername(username);
  const challengeHex = consumeChallenge(hash);
  if (!challengeHex) throw new Error('no pending challenge');

  const record = await getAccountRecord(hash);
  if (!record) throw new Error('account not found');

  const valid = verifySignature(
    hexToBytes(signatureHex),
    hexToBytes(challengeHex),
    hexToBytes(record.publicKeyHex),
  );
  if (!valid) throw new Error('invalid signature');

  return { token: createSession(hash), record };
}

export async function verifyRegistration(
  username: string,
  signatureHex: string,
): Promise<{ token: string }> {
  const { token } = await verifyChallengeSignature(username, signatureHex);
  return { token };
}

// ---------------------------------------------------------------------------
// Login flow
// ---------------------------------------------------------------------------

export async function loginOprf(username: string, blindedHex: string): Promise<{
  evaluatedHex: string;
  orgId: string;
  challengeHex: string;
}> {
  const hash = hashUsername(username);
  const record = await getAccountRecord(hash);
  if (!record) throw new Error('user not found');

  const { oprfSeed, orgId } = await getSecrets();
  const clientKey = deriveOprfKey(oprfSeed, hash);
  const evaluatedHex = oprfEvaluate(clientKey, blindedHex);
  const challengeHex = issueChallenge(hash);

  return { evaluatedHex, orgId, challengeHex };
}

export async function verifyLogin(
  username: string,
  signatureHex: string,
): Promise<{ token: string; accountId: string }> {
  const { token, record } = await verifyChallengeSignature(username, signatureHex);
  return { token, accountId: record.accountId };
}

export function sessionLogout(_token: string) {
  // Stateless JWT — no server-side session to invalidate.
  // A token blocklist could be added here for immediate revocation if needed.
}