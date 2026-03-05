/**
 * Unit tests for GET /balances/:accountId route.
 *
 * Mocks services and middleware so no DB, Hedera, or auth infrastructure needed.
 * Uses Node's built-in test runner + mock.module().
 *
 * Run: node --test --experimental-test-module-mocks --import tsx test/routes/balances.test.ts
 */

import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing the app
// ---------------------------------------------------------------------------

const mockIsValidSession = mock.fn((_token: string) => true);

mock.module('../../src/services/account.js', {
  namedExports: {
    checkAvailability: mock.fn(async () => ({ available: true })),
    evaluateOprf: mock.fn(async () => ({ evaluatedHex: 'aa'.repeat(32), orgId: 'org-1' })),
    completeRegistration: mock.fn(async () => ({ challengeHex: 'bb'.repeat(32) })),
    verifyRegistration: mock.fn(async () => ({ token: 'jwt' })),
    loginOprf: mock.fn(async () => ({ evaluatedHex: 'cc'.repeat(32), orgId: 'org-1', challengeHex: 'dd'.repeat(32) })),
    verifyLogin: mock.fn(async () => ({ token: 'jwt', accountId: '0.0.1' })),
    hashUsername: mock.fn((r: string) => `h_${r}`),
    isValidSession: mockIsValidSession,
    sessionLogout: mock.fn(),
    issueChallenge: mock.fn(() => 'ee'.repeat(32)),
    consumeChallenge: mock.fn(() => 'ff'.repeat(32)),
    createSession: mock.fn(() => 'jwt-session'),
  },
});

mock.module('../../src/services/index.js', {
  namedExports: {
    checkAvailability: mock.fn(async () => ({ available: true })),
    evaluateOprf: mock.fn(async () => ({ evaluatedHex: 'aa'.repeat(32), orgId: 'org-1' })),
    completeRegistration: mock.fn(async () => ({ challengeHex: 'bb'.repeat(32) })),
    verifyRegistration: mock.fn(async () => ({ token: 'jwt' })),
    loginOprf: mock.fn(async () => ({ evaluatedHex: 'cc'.repeat(32), orgId: 'org-1', challengeHex: 'dd'.repeat(32) })),
    verifyLogin: mock.fn(async () => ({ token: 'jwt', accountId: '0.0.1' })),
    hashUsername: mock.fn((r: string) => `h_${r}`),
    isValidSession: mockIsValidSession,
  },
});

const mockFetchBalance = mock.fn(async (_accountId: string) => ({
  account: '0.0.12345',
  balance: { hbars: 100 },
  tokens: [],
}));

mock.module('../../src/services/balance.js', {
  namedExports: {
    fetchBalance: mockFetchBalance,
  },
});

mock.module('../../src/ledger/index.js', {
  namedExports: {
    createAccount: mock.fn(async () => '0.0.99999'),
    getClient: mock.fn(() => ({})),
    closeClient: mock.fn(),
  },
});

const passThrough = (_req: any, _res: any, next: any) => next();
mock.module('../../src/middleware/rate-limit.js', {
  namedExports: {
    registerLimiter: passThrough,
    loginLimiter: passThrough,
    logoutLimiter: passThrough,
    generalLimiter: passThrough,
  },
});

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

async function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const json = await res.json();
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('GET /balances/:accountId', () => {
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
    mockIsValidSession.mock.resetCalls();
    mockFetchBalance.mock.resetCalls();
    mockIsValidSession.mock.mockImplementation((_token: string) => true);
    mockFetchBalance.mock.mockImplementation(async (_accountId: string) => ({
      account: '0.0.12345',
      balance: { hbars: 100 },
      tokens: [],
    }));
  });

  it('returns balance for authenticated request', async () => {
    const { status, json } = await get('/balances/0.0.12345', {
      Authorization: 'Bearer valid-token',
    });
    assert.equal(status, 200);
    assert.equal(json.account, '0.0.12345');
    assert.ok(json.balance);
    assert.equal(mockFetchBalance.mock.callCount(), 1);
  });

  it('returns 401 when no Authorization header', async () => {
    const { status, json } = await get('/balances/0.0.12345');
    assert.equal(status, 401);
    assert.equal(json.error, 'Unauthorized');
  });

  it('returns 401 when token is invalid', async () => {
    mockIsValidSession.mock.mockImplementation(() => false);
    const { status, json } = await get('/balances/0.0.12345', {
      Authorization: 'Bearer bad-token',
    });
    assert.equal(status, 401);
    assert.equal(json.error, 'Unauthorized');
  });

  it('returns 502 when mirror node fails', async () => {
    mockFetchBalance.mock.mockImplementation(async () => {
      throw new Error('mirror node timeout');
    });
    const { status, json } = await get('/balances/0.0.12345', {
      Authorization: 'Bearer valid-token',
    });
    assert.equal(status, 502);
    assert.equal(json.error, 'Failed to fetch balance from mirror node');
  });

  it('passes accountId from URL params to service', async () => {
    await get('/balances/0.0.98765', {
      Authorization: 'Bearer valid-token',
    });
    const call = mockFetchBalance.mock.calls[0];
    assert.equal(call.arguments[0], '0.0.98765');
  });
});
