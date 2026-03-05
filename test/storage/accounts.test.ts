/**
 * Unit tests for file-backed accounts storage.
 *
 * Mocks the store module so no actual files are touched.
 * Uses Node's built-in test runner + mock.module().
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock the store module BEFORE importing accounts
// ---------------------------------------------------------------------------

let storedData: Record<string, unknown> | null = null;

const mockReadJson = mock.fn(() => storedData);
const mockWriteJson = mock.fn((_filename: string, data: unknown) => {
  storedData = data as Record<string, unknown>;
});

mock.module('../../src/storage/store.js', {
  namedExports: {
    readJson: mockReadJson,
    writeJson: mockWriteJson,
    loadOrCreate: mock.fn(),
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

const accounts = await import('../../src/storage/accounts.js');

describe('File-backed accounts storage', () => {
  it('accountExists returns false for unknown user', () => {
    assert.equal(accounts.accountExists('unknown_hash'), false);
  });

  it('creates and retrieves an account record', () => {
    accounts.createAccountRecord('hash_alice', 'pubkey_hex', '0.0.123');
    assert.equal(accounts.accountExists('hash_alice'), true);

    const record = accounts.getAccountRecord('hash_alice');
    assert.ok(record);
    assert.equal(record.publicKeyHex, 'pubkey_hex');
    assert.equal(record.accountId, '0.0.123');
    assert.ok(record.createdAt);
  });

  it('writeJson is called on create', () => {
    const callsBefore = mockWriteJson.mock.callCount();
    accounts.createAccountRecord('hash_bob', 'key', '0.0.456');
    assert.ok(mockWriteJson.mock.callCount() > callsBefore);
  });

  it('clearAccounts removes all records', () => {
    accounts.createAccountRecord('hash_clear', 'key', '0.0.789');
    assert.equal(accounts.accountExists('hash_clear'), true);

    accounts.clearAccounts();
    assert.equal(accounts.accountExists('hash_clear'), false);
  });

  it('getAccountRecord returns undefined for missing user', () => {
    const result = accounts.getAccountRecord('nonexistent');
    assert.equal(result, undefined);
  });
});
