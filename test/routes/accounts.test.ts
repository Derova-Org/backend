/**
 * Unit tests for account auth routes.
 *
 * Mocks the services layer so no DB or Hedera connection is needed.
 * Uses Node's built-in test runner + mock.module().
 *
 * Run: node --test --import tsx test/routes/accounts.test.ts
 */

import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

// ---------------------------------------------------------------------------
// Mock services BEFORE importing the app
// ---------------------------------------------------------------------------

const mockCheckAvailability = mock.fn(async (_username: string) => ({ available: true }));
const mockEvaluateOprf = mock.fn(async (_username: string, _blindedHex: string) => ({
  evaluatedHex: 'aa'.repeat(32),
  orgId: 'org-test-123',
}));
const mockCompleteRegistration = mock.fn(async (_username: string, _publicKeyHex: string, _accountId: string) => ({
  challengeHex: 'bb'.repeat(32),
}));
const mockVerifyRegistration = mock.fn(async (_username: string, _signatureHex: string) => ({
  token: 'jwt-token-register',
}));
const mockLoginOprf = mock.fn(async (_username: string, _blindedHex: string) => ({
  evaluatedHex: 'cc'.repeat(32),
  orgId: 'org-test-123',
  challengeHex: 'dd'.repeat(32),
}));
const mockVerifyLogin = mock.fn(async (_username: string, _signatureHex: string) => ({
  token: 'jwt-token-login',
  accountId: '0.0.12345',
}));
const mockHashUsername = mock.fn((raw: string) => `hashed_${raw}`);
const mockIsValidSession = mock.fn((_token: string) => true);
const mockSessionLogout = mock.fn((_token: string) => {});

mock.module('../../src/services/index.js', {
  namedExports: {
    checkAvailability: mockCheckAvailability,
    evaluateOprf: mockEvaluateOprf,
    completeRegistration: mockCompleteRegistration,
    verifyRegistration: mockVerifyRegistration,
    loginOprf: mockLoginOprf,
    verifyLogin: mockVerifyLogin,
    hashUsername: mockHashUsername,
    isValidSession: mockIsValidSession,
  },
});

mock.module('../../src/services/account.js', {
  namedExports: {
    checkAvailability: mockCheckAvailability,
    evaluateOprf: mockEvaluateOprf,
    completeRegistration: mockCompleteRegistration,
    verifyRegistration: mockVerifyRegistration,
    loginOprf: mockLoginOprf,
    verifyLogin: mockVerifyLogin,
    hashUsername: mockHashUsername,
    isValidSession: mockIsValidSession,
    sessionLogout: mockSessionLogout,
    issueChallenge: mock.fn(() => 'ee'.repeat(32)),
    consumeChallenge: mock.fn(() => 'ff'.repeat(32)),
    createSession: mock.fn(() => 'jwt-session'),
  },
});

mock.module('../../src/ledger/index.js', {
  namedExports: {
    createAccount: mock.fn(async () => '0.0.99999'),
    getClient: mock.fn(() => ({})),
    closeClient: mock.fn(),
  },
});

// Mock rate limiters to be pass-through for unit tests
const passThrough = (_req: any, _res: any, next: any) => next();
mock.module('../../src/middleware/rate-limit.js', {
  namedExports: {
    registerLimiter: passThrough,
    loginLimiter: passThrough,
    logoutLimiter: passThrough,
    generalLimiter: passThrough,
  },
});

// Suppress pino logging during tests
mock.module('../../src/logger.js', {
  defaultExport: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
  },
});

const { createApp } = await import('../../src/index.js');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

function resetMocks() {
  mockCheckAvailability.mock.resetCalls();
  mockEvaluateOprf.mock.resetCalls();
  mockCompleteRegistration.mock.resetCalls();
  mockVerifyRegistration.mock.resetCalls();
  mockLoginOprf.mock.resetCalls();
  mockVerifyLogin.mock.resetCalls();
  mockSessionLogout.mock.resetCalls();
}

async function post(path: string, body?: Record<string, unknown>): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Account auth routes', () => {
  before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(() => {
    server.close();
  });

  beforeEach(() => {
    resetMocks();
  });

  // -------------------------------------------------------------------------
  // POST /accounts/register/init
  // -------------------------------------------------------------------------

  describe('POST /accounts/register/init', () => {
    it('returns available: true for a valid username', async () => {
      const { status, json } = await post('/accounts/register/init', { username: 'alice' });
      assert.equal(status, 200);
      assert.equal(json.available, true);
      assert.equal(mockCheckAvailability.mock.callCount(), 1);
    });

    it('returns 409 when username is taken', async () => {
      mockCheckAvailability.mock.mockImplementationOnce(async () => ({ available: false }));
      const { status, json } = await post('/accounts/register/init', { username: 'taken' });
      assert.equal(status, 409);
      assert.equal(json.available, false);
    });

    it('returns 400 for missing username', async () => {
      const { status, json } = await post('/accounts/register/init', {});
      assert.equal(status, 400);
      assert.ok(json.error);
    });

    it('returns 400 for invalid username (special chars)', async () => {
      const { status } = await post('/accounts/register/init', { username: 'bad@user!' });
      assert.equal(status, 400);
    });

    it('returns 400 for empty username', async () => {
      const { status } = await post('/accounts/register/init', { username: '' });
      assert.equal(status, 400);
    });

    it('returns 400 for username exceeding 64 chars', async () => {
      const { status } = await post('/accounts/register/init', { username: 'a'.repeat(65) });
      assert.equal(status, 400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /accounts/register/oprf
  // -------------------------------------------------------------------------

  describe('POST /accounts/register/oprf', () => {
    it('returns evaluatedHex and orgId for valid input', async () => {
      const { status, json } = await post('/accounts/register/oprf', {
        username: 'alice',
        blindedHex: 'aabb',
      });
      assert.equal(status, 200);
      assert.ok(json.evaluatedHex);
      assert.ok(json.orgId);
    });

    it('returns 400 for missing blindedHex', async () => {
      const { status } = await post('/accounts/register/oprf', { username: 'alice' });
      assert.equal(status, 400);
    });

    it('returns 400 for invalid blindedHex (odd length)', async () => {
      const { status } = await post('/accounts/register/oprf', {
        username: 'alice',
        blindedHex: 'abc',
      });
      assert.equal(status, 400);
    });

    it('returns 400 for missing username', async () => {
      const { status } = await post('/accounts/register/oprf', { blindedHex: 'aabb' });
      assert.equal(status, 400);
    });

    it('returns 500 when service throws', async () => {
      mockEvaluateOprf.mock.mockImplementationOnce(async () => { throw new Error('boom'); });
      const { status, json } = await post('/accounts/register/oprf', {
        username: 'alice',
        blindedHex: 'aabb',
      });
      assert.equal(status, 500);
      assert.equal(json.error, 'OPRF evaluation failed');
    });
  });

  // -------------------------------------------------------------------------
  // POST /accounts/register/complete
  // -------------------------------------------------------------------------

  describe('POST /accounts/register/complete', () => {
    const validPublicKey = 'aa'.repeat(32); // 64 hex chars

    it('returns challengeHex for valid registration', async () => {
      const { status, json } = await post('/accounts/register/complete', {
        username: 'alice',
        publicKeyHex: validPublicKey,
        accountId: '0.0.12345',
      });
      assert.equal(status, 200);
      assert.ok(json.challengeHex);
    });

    it('creates Hedera account when accountId not provided', async () => {
      const { status, json } = await post('/accounts/register/complete', {
        username: 'alice',
        publicKeyHex: validPublicKey,
      });
      assert.equal(status, 200);
      assert.ok(json.challengeHex);
    });

    it('returns 400 for missing publicKeyHex', async () => {
      const { status } = await post('/accounts/register/complete', {
        username: 'alice',
      });
      assert.equal(status, 400);
    });

    it('returns 400 for short publicKeyHex (< 64 hex chars)', async () => {
      const { status } = await post('/accounts/register/complete', {
        username: 'alice',
        publicKeyHex: 'aabb',
      });
      assert.equal(status, 400);
    });

    it('returns 409 when username already taken', async () => {
      mockCompleteRegistration.mock.mockImplementationOnce(async () => {
        throw new Error('Username already taken');
      });
      const { status, json } = await post('/accounts/register/complete', {
        username: 'alice',
        publicKeyHex: validPublicKey,
        accountId: '0.0.12345',
      });
      assert.equal(status, 409);
      assert.equal(json.error, 'Username already taken');
    });

    it('returns 500 for unexpected service error', async () => {
      mockCompleteRegistration.mock.mockImplementationOnce(async () => {
        throw new Error('unexpected failure');
      });
      const { status, json } = await post('/accounts/register/complete', {
        username: 'alice',
        publicKeyHex: validPublicKey,
        accountId: '0.0.12345',
      });
      assert.equal(status, 500);
      assert.equal(json.error, 'Registration failed');
    });
  });

  // -------------------------------------------------------------------------
  // POST /accounts/register/verify
  // -------------------------------------------------------------------------

  describe('POST /accounts/register/verify', () => {
    it('returns JWT token on successful verification', async () => {
      const { status, json } = await post('/accounts/register/verify', {
        username: 'alice',
        signatureHex: 'aabb',
      });
      assert.equal(status, 200);
      assert.equal(json.token, 'jwt-token-register');
    });

    it('returns 400 for missing signatureHex', async () => {
      const { status } = await post('/accounts/register/verify', { username: 'alice' });
      assert.equal(status, 400);
    });

    it('returns 401 for invalid signature', async () => {
      mockVerifyRegistration.mock.mockImplementationOnce(async () => {
        throw new Error('invalid signature');
      });
      const { status, json } = await post('/accounts/register/verify', {
        username: 'alice',
        signatureHex: 'aabb',
      });
      assert.equal(status, 401);
      assert.equal(json.error, 'Invalid signature');
    });

    it('returns 400 for other verification errors', async () => {
      mockVerifyRegistration.mock.mockImplementationOnce(async () => {
        throw new Error('account not found');
      });
      const { status, json } = await post('/accounts/register/verify', {
        username: 'alice',
        signatureHex: 'aabb',
      });
      assert.equal(status, 400);
      assert.equal(json.error, 'Verification failed');
    });
  });

  // -------------------------------------------------------------------------
  // POST /accounts/login/oprf
  // -------------------------------------------------------------------------

  describe('POST /accounts/login/oprf', () => {
    it('returns evaluatedHex, orgId, and challengeHex on success', async () => {
      const { status, json } = await post('/accounts/login/oprf', {
        username: 'alice',
        blindedHex: 'aabb',
      });
      assert.equal(status, 200);
      assert.ok(json.evaluatedHex);
      assert.ok(json.orgId);
      assert.ok(json.challengeHex);
    });

    it('returns 400 for missing blindedHex', async () => {
      const { status } = await post('/accounts/login/oprf', { username: 'alice' });
      assert.equal(status, 400);
    });

    it('returns 404 when user not found', async () => {
      mockLoginOprf.mock.mockImplementationOnce(async () => {
        throw new Error('user not found');
      });
      const { status, json } = await post('/accounts/login/oprf', {
        username: 'unknown',
        blindedHex: 'aabb',
      });
      assert.equal(status, 404);
      assert.equal(json.error, 'User not found');
    });

    it('returns 500 for unexpected service error', async () => {
      mockLoginOprf.mock.mockImplementationOnce(async () => {
        throw new Error('db connection failed');
      });
      const { status, json } = await post('/accounts/login/oprf', {
        username: 'alice',
        blindedHex: 'aabb',
      });
      assert.equal(status, 500);
      assert.equal(json.error, 'Login failed');
    });
  });

  // -------------------------------------------------------------------------
  // POST /accounts/login/verify
  // -------------------------------------------------------------------------

  describe('POST /accounts/login/verify', () => {
    it('returns JWT token and accountId on success', async () => {
      const { status, json } = await post('/accounts/login/verify', {
        username: 'alice',
        signatureHex: 'aabb',
      });
      assert.equal(status, 200);
      assert.equal(json.token, 'jwt-token-login');
      assert.equal(json.accountId, '0.0.12345');
    });

    it('returns 400 for missing signatureHex', async () => {
      const { status } = await post('/accounts/login/verify', { username: 'alice' });
      assert.equal(status, 400);
    });

    it('returns 401 for invalid signature', async () => {
      mockVerifyLogin.mock.mockImplementationOnce(async () => {
        throw new Error('invalid signature');
      });
      const { status, json } = await post('/accounts/login/verify', {
        username: 'alice',
        signatureHex: 'aabb',
      });
      assert.equal(status, 401);
      assert.equal(json.error, 'Invalid signature');
    });

    it('returns 400 for no pending challenge', async () => {
      mockVerifyLogin.mock.mockImplementationOnce(async () => {
        throw new Error('no pending challenge');
      });
      const { status, json } = await post('/accounts/login/verify', {
        username: 'alice',
        signatureHex: 'aabb',
      });
      assert.equal(status, 400);
      assert.equal(json.error, 'No pending challenge');
    });

    it('returns 500 for unexpected service error', async () => {
      mockVerifyLogin.mock.mockImplementationOnce(async () => {
        throw new Error('db crashed');
      });
      const { status, json } = await post('/accounts/login/verify', {
        username: 'alice',
        signatureHex: 'aabb',
      });
      assert.equal(status, 500);
      assert.equal(json.error, 'Login verification failed');
    });
  });

  // -------------------------------------------------------------------------
  // POST /accounts/logout
  // -------------------------------------------------------------------------

  describe('POST /accounts/logout', () => {
    it('returns success on valid logout', async () => {
      const { status, json } = await post('/accounts/logout', { token: 'some-jwt' });
      assert.equal(status, 200);
      assert.equal(json.success, true);
      assert.equal(mockSessionLogout.mock.callCount(), 1);
    });

    it('returns 400 for missing token', async () => {
      const { status, json } = await post('/accounts/logout', {});
      assert.equal(status, 400);
      assert.equal(json.error, 'token required');
    });

    it('returns 500 when sessionLogout throws', async () => {
      mockSessionLogout.mock.mockImplementationOnce(() => { throw new Error('boom'); });
      const { status, json } = await post('/accounts/logout', { token: 'some-jwt' });
      assert.equal(status, 500);
      assert.equal(json.error, 'Logout failed');
    });
  });

  // -------------------------------------------------------------------------
  // Rate limiting (uses a separate mini-app with real express-rate-limit)
  // -------------------------------------------------------------------------

  describe('Rate limiting', () => {
    it('returns 429 after exceeding rate limit', async () => {
      // Create a minimal app with a tight rate limiter to verify 429 behavior
      const { default: express } = await import('express');
      const { default: rateLimit } = await import('express-rate-limit');

      const limiter = rateLimit({ windowMs: 60_000, max: 2, message: { error: 'Too many requests' } });
      const miniApp = express();
      miniApp.use(express.json());
      miniApp.post('/test', limiter, (_req, res) => { res.json({ ok: true }); });

      const miniServer = await new Promise<import('node:http').Server>((resolve) => {
        const s = miniApp.listen(0, () => resolve(s));
      });
      const addr = miniServer.address();
      const miniUrl = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';

      try {
        const results: number[] = [];
        for (let i = 0; i < 4; i++) {
          const res = await fetch(`${miniUrl}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          });
          results.push(res.status);
        }
        assert.ok(results.includes(429), `Expected 429 in results but got: ${results.join(', ')}`);
        // First 2 should succeed
        assert.equal(results[0], 200);
        assert.equal(results[1], 200);
      } finally {
        miniServer.close();
      }
    });
  });
});
