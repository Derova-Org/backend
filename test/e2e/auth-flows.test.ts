/**
 * E2E smoke tests for critical auth flows.
 *
 * Exercises the full OPRF registration + login flow against a real backend
 * with PostgreSQL. Requires DATABASE_URL to point to a test database.
 *
 * Run: npm run test:e2e
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, stopServer, cleanDb, post, get, registerUser, loginUser } from './helpers.js';
import {
  blindPassword,
  finalizeOprf,
  deriveKeypair,
  signChallenge,
  bytesToHex,
  hexToBytes,
  randomBytes,
  ARGON2_DEV,
} from '@derova/sdk';

describe('E2E: Auth Flows', () => {
  before(async () => {
    await startServer();
  });

  after(async () => {
    await stopServer();
  });

  beforeEach(async () => {
    await cleanDb();
  });

  // -------------------------------------------------------------------------
  // 1. Register a new account (full OPRF flow)
  // -------------------------------------------------------------------------

  describe('Registration', () => {
    it('should register a new account through the full OPRF flow', async () => {
      const { token, publicKeyHex } = await registerUser('alice', 'password123');

      assert.ok(token, 'should return a session token');
      assert.ok(token.length > 0);
      assert.ok(publicKeyHex, 'should have a public key');
    });

    it('should reject duplicate username registration', async () => {
      await registerUser('bob', 'password123');

      const initRes = await post('/accounts/register/init', { username: 'bob' });
      assert.equal(initRes.status, 409, 'should return 409 for taken username');
      assert.equal(initRes.body.available, false);
    });

    it('should reject invalid username formats', async () => {
      const res = await post('/accounts/register/init', { username: '' });
      assert.equal(res.status, 400);

      const res2 = await post('/accounts/register/init', { username: 'a'.repeat(65) });
      assert.equal(res2.status, 400);

      const res3 = await post('/accounts/register/init', { username: 'user@name' });
      assert.equal(res3.status, 400);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Login with registered credentials
  // -------------------------------------------------------------------------

  describe('Login', () => {
    it('should login with registered credentials through full OPRF flow', async () => {
      await registerUser('charlie', 'secure-pass');

      const { token, accountId } = await loginUser('charlie', 'secure-pass');

      assert.ok(token, 'should return a session token');
      assert.equal(accountId, '0.0.99999', 'should return the account ID');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Validate session token
  // -------------------------------------------------------------------------

  describe('Session validation', () => {
    it('should accept valid session token on protected endpoint', async () => {
      const { token } = await registerUser('dave', 'pass456');

      // Hit the protected /balances endpoint — will 502 (no mirror node) but not 401
      const res = await get('/balances/0.0.99999', { Authorization: `Bearer ${token}` });
      assert.notEqual(res.status, 401, 'valid token should not return 401');
    });

    it('should reject requests without a token', async () => {
      const res = await get('/balances/0.0.99999');
      assert.equal(res.status, 401);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Logout
  // -------------------------------------------------------------------------

  describe('Logout', () => {
    it('should successfully logout with a valid token', async () => {
      const { token } = await registerUser('eve', 'pass789');

      const res = await post('/accounts/logout', { token });
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });

    it('should reject logout without a token', async () => {
      const res = await post('/accounts/logout', {});
      assert.equal(res.status, 400);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Reject invalid credentials
  // -------------------------------------------------------------------------

  describe('Invalid credentials', () => {
    it('should reject login for non-existent user', async () => {
      const { blindedHex } = blindPassword('anypass');
      const res = await post('/accounts/login/oprf', { username: 'nobody', blindedHex });
      assert.equal(res.status, 404);
    });

    it('should reject login with wrong password (invalid signature)', async () => {
      await registerUser('frank', 'correct-password');

      // Login OPRF step with wrong password — derives wrong keypair
      const { blindedHex, blind } = blindPassword('wrong-password');
      const oprfRes = await post('/accounts/login/oprf', { username: 'frank', blindedHex });
      assert.equal(oprfRes.status, 200);

      const oprfOutput = finalizeOprf(oprfRes.body.evaluatedHex, blind);
      const { privateKey } = deriveKeypair(
        oprfOutput, 'frank', oprfRes.body.orgId, ARGON2_DEV,
      );
      const signature = signChallenge(hexToBytes(oprfRes.body.challengeHex), privateKey);

      const verifyRes = await post('/accounts/login/verify', {
        username: 'frank',
        signatureHex: bytesToHex(signature),
      });
      assert.equal(verifyRes.status, 401, 'wrong password should yield invalid signature');
    });

    it('should reject registration verify with bogus signature', async () => {
      const initRes = await post('/accounts/register/init', { username: 'grace' });
      assert.equal(initRes.status, 200);

      const { blindedHex } = blindPassword('pass');
      const oprfRes = await post('/accounts/register/oprf', { username: 'grace', blindedHex });
      assert.equal(oprfRes.status, 200);

      const fakePublicKey = bytesToHex(randomBytes(32)).padStart(64, '0');
      const completeRes = await post('/accounts/register/complete', {
        username: 'grace',
        publicKeyHex: fakePublicKey,
        accountId: '0.0.11111',
      });
      assert.equal(completeRes.status, 200);

      const bogusSignature = bytesToHex(randomBytes(64));
      const verifyRes = await post('/accounts/register/verify', {
        username: 'grace',
        signatureHex: bogusSignature,
      });
      assert.equal(verifyRes.status, 401, 'bogus signature should be rejected');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Reject expired/invalid sessions
  // -------------------------------------------------------------------------

  describe('Expired/invalid sessions', () => {
    it('should reject an invalid JWT token', async () => {
      const res = await get('/balances/0.0.99999', { Authorization: 'Bearer not-a-valid-jwt' });
      assert.equal(res.status, 401);
    });

    it('should reject a tampered JWT token', async () => {
      const { token } = await registerUser('hank', 'pass000');
      const tampered = token.slice(0, -5) + 'XXXXX';
      const res = await get('/balances/0.0.99999', { Authorization: `Bearer ${tampered}` });
      assert.equal(res.status, 401);
    });
  });
});
