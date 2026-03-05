/**
 * Unit tests for PostgreSQL-backed accounts storage.
 *
 * Mocks the db module so no real PostgreSQL connection is needed.
 * Uses Node's built-in test runner + mock.module().
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock db module BEFORE importing accounts-pg
// ---------------------------------------------------------------------------

const mockQuery = mock.fn(async () => ({ rows: [], rowCount: 0 }));

mock.module('../../src/storage/db.js', {
  namedExports: {
    query: mockQuery,
    getPool: mock.fn(() => ({})),
    closePool: mock.fn(async () => {}),
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

const pgAccounts = await import('../../src/storage/accounts-pg.js');

describe('PostgreSQL accounts storage', () => {
  beforeEach(() => {
    mockQuery.mock.resetCalls();
    mockQuery.mock.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
  });

  describe('accountExists', () => {
    it('returns true when row found', async () => {
      mockQuery.mock.mockImplementation(async () => ({ rows: [{ '1': 1 }], rowCount: 1 }));
      const exists = await pgAccounts.accountExists('hash_alice');
      assert.equal(exists, true);
      assert.equal(mockQuery.mock.calls[0].arguments[0], 'SELECT 1 FROM accounts WHERE username_hash = $1');
      assert.deepEqual(mockQuery.mock.calls[0].arguments[1], ['hash_alice']);
    });

    it('returns false when no rows', async () => {
      const exists = await pgAccounts.accountExists('hash_unknown');
      assert.equal(exists, false);
    });

    it('returns false when rowCount is null', async () => {
      mockQuery.mock.mockImplementation(async () => ({ rows: [], rowCount: null }));
      const exists = await pgAccounts.accountExists('hash_null');
      assert.equal(exists, false);
    });
  });

  describe('createAccountRecord', () => {
    it('inserts a record with correct params', async () => {
      await pgAccounts.createAccountRecord('hash_bob', 'pubkey', '0.0.123');
      assert.equal(mockQuery.mock.callCount(), 1);
      const [sql, params] = mockQuery.mock.calls[0].arguments;
      assert.ok((sql as string).includes('INSERT INTO accounts'));
      assert.deepEqual(params, ['hash_bob', 'pubkey', '0.0.123']);
    });
  });

  describe('getAccountRecord', () => {
    it('returns mapped record when found', async () => {
      const createdAt = new Date('2025-01-01');
      mockQuery.mock.mockImplementation(async () => ({
        rows: [{ public_key_hex: 'aabb', account_id: '0.0.99', created_at: createdAt }],
        rowCount: 1,
      }));
      const record = await pgAccounts.getAccountRecord('hash_alice');
      assert.ok(record);
      assert.equal(record.publicKeyHex, 'aabb');
      assert.equal(record.accountId, '0.0.99');
      assert.equal(record.createdAt, createdAt.toISOString());
    });

    it('returns undefined when not found', async () => {
      const record = await pgAccounts.getAccountRecord('hash_unknown');
      assert.equal(record, undefined);
    });

    it('returns undefined when rowCount is null', async () => {
      mockQuery.mock.mockImplementation(async () => ({ rows: [], rowCount: null }));
      const record = await pgAccounts.getAccountRecord('hash_null');
      assert.equal(record, undefined);
    });
  });

  describe('clearAccounts', () => {
    it('executes DELETE query', async () => {
      await pgAccounts.clearAccounts();
      assert.equal(mockQuery.mock.callCount(), 1);
      assert.equal(mockQuery.mock.calls[0].arguments[0], 'DELETE FROM accounts');
    });
  });
});
