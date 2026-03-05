/**
 * Unit tests for /health and /ready endpoints.
 *
 * Mocks DB and other dependencies so tests run in isolation.
 * Uses Node's built-in test runner + mock.module().
 *
 * Run: node --test --experimental-test-module-mocks --import tsx test/routes/health.test.ts
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing the app
// ---------------------------------------------------------------------------

const mockQuery = mock.fn(async () => ({ rows: [{ '?column?': 1 }] }));

mock.module('../../src/storage/db.js', {
  namedExports: {
    query: mockQuery,
    getPool: mock.fn(() => ({})),
    closePool: mock.fn(async () => {}),
  },
});

mock.module('../../src/services/account.js', {
  namedExports: {
    checkAvailability: mock.fn(async () => ({ available: true })),
    evaluateOprf: mock.fn(async () => ({ evaluatedHex: 'aa'.repeat(32), orgId: 'org-1' })),
    completeRegistration: mock.fn(async () => ({ challengeHex: 'bb'.repeat(32) })),
    verifyRegistration: mock.fn(async () => ({ token: 'jwt' })),
    loginOprf: mock.fn(async () => ({ evaluatedHex: 'cc'.repeat(32), orgId: 'org-1', challengeHex: 'dd'.repeat(32) })),
    verifyLogin: mock.fn(async () => ({ token: 'jwt', accountId: '0.0.1' })),
    hashUsername: mock.fn((r: string) => `h_${r}`),
    isValidSession: mock.fn(() => true),
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
    isValidSession: mock.fn(() => true),
  },
});

mock.module('../../src/services/balance.js', {
  namedExports: {
    fetchBalance: mock.fn(async () => ({ account: '0.0.1', balance: { hbars: 0 }, tokens: [] })),
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

async function get(path: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json();
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Health endpoints', () => {
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

  describe('GET /health', () => {
    it('returns status ok with uptime', async () => {
      const { status, json } = await get('/health');
      assert.equal(status, 200);
      assert.equal(json.status, 'ok');
      assert.equal(typeof json.uptime, 'number');
      assert.ok(json.uptime >= 0);
    });
  });

  describe('GET /ready', () => {
    it('returns db: not configured when no DATABASE_URL or PGDATABASE', async () => {
      const origDbUrl = process.env.DATABASE_URL;
      const origPgDb = process.env.PGDATABASE;
      delete process.env.DATABASE_URL;
      delete process.env.PGDATABASE;

      try {
        const { status, json } = await get('/ready');
        assert.equal(status, 200);
        assert.equal(json.status, 'ok');
        assert.equal(json.db, 'not configured');
      } finally {
        if (origDbUrl !== undefined) process.env.DATABASE_URL = origDbUrl;
        if (origPgDb !== undefined) process.env.PGDATABASE = origPgDb;
      }
    });

    it('returns db: connected when DATABASE_URL is set and query succeeds', async () => {
      const origDbUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgres://localhost/test';
      mockQuery.mock.mockImplementationOnce(async () => ({ rows: [{ '?column?': 1 }] }));

      try {
        const { status, json } = await get('/ready');
        assert.equal(status, 200);
        assert.equal(json.status, 'ok');
        assert.equal(json.db, 'connected');
      } finally {
        if (origDbUrl !== undefined) {
          process.env.DATABASE_URL = origDbUrl;
        } else {
          delete process.env.DATABASE_URL;
        }
      }
    });

    it('returns 503 when DB query fails', async () => {
      const origDbUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = 'postgres://localhost/test';
      mockQuery.mock.mockImplementationOnce(async () => { throw new Error('connection refused'); });

      try {
        const { status, json } = await get('/ready');
        assert.equal(status, 503);
        assert.equal(json.status, 'error');
        assert.equal(json.reason, 'connection refused');
      } finally {
        if (origDbUrl !== undefined) {
          process.env.DATABASE_URL = origDbUrl;
        } else {
          delete process.env.DATABASE_URL;
        }
      }
    });
  });
});
