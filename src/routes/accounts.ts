/**
 * Account registration and login routes.
 *
 * POST /accounts/register/init      — check username availability
 * POST /accounts/register/oprf      — OPRF evaluation
 * POST /accounts/register/complete  — store public key, create account
 * POST /accounts/register/verify    — verify signature, issue session
 * POST /accounts/login/oprf         — OPRF evaluation + issue challenge
 * POST /accounts/login/verify       — verify signature, issue session
 *
 * Reference: decentralized-login-development/src/server/routes/auth.ts
 */

import { Router } from 'express';
import {
  checkAvailability,
  evaluateOprf,
  completeRegistration,
  verifyRegistration,
  loginOprf,
  verifyLogin,
} from '../services/index.js';
import { createAccount, getClient } from '../ledger/index.js';
import {sessionLogout} from "../services/account.js";
import { registerLimiter, loginLimiter, logoutLimiter } from '../middleware/rate-limit.js';

export const accountsRouter = Router();

const USERNAME_RE = /^[a-zA-Z0-9_.-]{1,64}$/;
const HEX_RE = /^[0-9a-fA-F]+$/;

function isValidUsername(v: unknown): v is string {
  return typeof v === 'string' && USERNAME_RE.test(v);
}

function isValidHex(v: unknown, minLen = 2): v is string {
  return typeof v === 'string' && v.length >= minLen && v.length % 2 === 0 && HEX_RE.test(v);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

accountsRouter.post('/accounts/register/init', registerLimiter, async (req, res) => {
  const { username } = req.body;
  if (!isValidUsername(username)) { res.status(400).json({ error: 'username must be 1-64 alphanumeric/._- characters' }); return; }
  const result = await checkAvailability(username);
  res.status(result.available ? 200 : 409).json(result);
});

accountsRouter.post('/accounts/register/oprf', registerLimiter, async (req, res) => {
  const { username, blindedHex } = req.body;
  if (!isValidUsername(username) || !isValidHex(blindedHex)) { res.status(400).json({ error: 'valid username and blindedHex required' }); return; }
  try {
    res.json(await evaluateOprf(username, blindedHex));
  } catch {
    res.status(500).json({ error: 'OPRF evaluation failed' });
  }
});

accountsRouter.post('/accounts/register/complete', registerLimiter, async (req, res) => {
  const { username, publicKeyHex, accountId } = req.body;
  if (!isValidUsername(username) || !isValidHex(publicKeyHex, 64)) {
    res.status(400).json({ error: 'valid username and publicKeyHex (≥64 hex chars) required' }); return;
  }
  try {
    let id = accountId;
    if (!id) {
      const client = getClient();
      id = await createAccount(client, publicKeyHex);
    }
    res.json(await completeRegistration(username, publicKeyHex, id));
  } catch (e: any) {
    const status = e.message === 'Username already taken' ? 409 : 500;
    res.status(status).json({ error: status === 409 ? 'Username already taken' : 'Registration failed' });
  }
});

accountsRouter.post('/accounts/register/verify', registerLimiter, async (req, res) => {
  const { username, signatureHex } = req.body;
  if (!isValidUsername(username) || !isValidHex(signatureHex)) { res.status(400).json({ error: 'valid username and signatureHex required' }); return; }
  try {
    res.json(await verifyRegistration(username, signatureHex));
  } catch (e: any) {
    const status = e.message === 'invalid signature' ? 401 : 400;
    const msg = status === 401 ? 'Invalid signature' : 'Verification failed';
    res.status(status).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

accountsRouter.post('/accounts/login/oprf', loginLimiter, async (req, res) => {
  const { username, blindedHex } = req.body;
  if (!isValidUsername(username) || !isValidHex(blindedHex)) { res.status(400).json({ error: 'valid username and blindedHex required' }); return; }
  try {
    res.json(await loginOprf(username, blindedHex));
  } catch (e: any) {
    const status = e.message === 'user not found' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? 'User not found' : 'Login failed' });
  }
});

accountsRouter.post('/accounts/login/verify', loginLimiter, async (req, res) => {
  const { username, signatureHex } = req.body;
  if (!isValidUsername(username) || !isValidHex(signatureHex)) { res.status(400).json({ error: 'valid username and signatureHex required' }); return; }
  try {
    res.json(await verifyLogin(username, signatureHex));
  } catch (e: any) {
    const status = e.message === 'invalid signature' ? 401
      : e.message === 'no pending challenge' ? 400
      : 500;
    const msg = status === 401 ? 'Invalid signature'
      : status === 400 ? 'No pending challenge'
      : 'Login verification failed';
    res.status(status).json({ error: msg });
  }
});


// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

accountsRouter.post('/accounts/logout', logoutLimiter, (req, res) => {
  const { token } = req.body;
  if (!token) { res.status(400).json({ error: 'token required' }); return; }
  try {
    sessionLogout(token);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Logout failed' });
  }
});
