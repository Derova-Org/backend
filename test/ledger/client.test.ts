/**
 * Unit tests for Hedera client initialization (ledger/client.ts).
 *
 * Mocks @hashgraph/sdk so no real Hedera connection is created.
 * Uses Node's built-in test runner + mock.module().
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock @hashgraph/sdk BEFORE importing client
// ---------------------------------------------------------------------------

const mockSetOperator = mock.fn();
const mockClose = mock.fn();

const fakeClient = {
  setOperator: mockSetOperator,
  close: mockClose,
};

const mockForTestnet = mock.fn(() => ({ ...fakeClient }));
const mockForMainnet = mock.fn(() => ({ ...fakeClient }));
const mockFromStringDer = mock.fn((key: string) => `parsed_${key}`);

mock.module('@hashgraph/sdk', {
  namedExports: {
    Client: {
      forTestnet: mockForTestnet,
      forMainnet: mockForMainnet,
    },
    PrivateKey: {
      fromStringDer: mockFromStringDer,
    },
    AccountCreateTransaction: mock.fn(),
    Hbar: mock.fn(),
    PublicKey: mock.fn(),
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

const { getClient, closeClient } = await import('../../src/ledger/client.js');

describe('Hedera client (client.ts)', () => {
  const origOpId = process.env.HEDERA_OPERATOR_ID;
  const origOpKey = process.env.HEDERA_OPERATOR_KEY;

  beforeEach(() => {
    // Reset env vars
    process.env.HEDERA_OPERATOR_ID = '0.0.12345';
    process.env.HEDERA_OPERATOR_KEY = 'test-key-der';
    mockSetOperator.mock.resetCalls();
    mockClose.mock.resetCalls();
    mockForTestnet.mock.resetCalls();
    mockForMainnet.mock.resetCalls();
    // Close any cached clients between tests
    closeClient();
  });

  // Restore after all
  // after() not needed since beforeEach resets

  it('creates a testnet client by default', () => {
    const client = getClient();
    assert.ok(client);
    assert.equal(mockForTestnet.mock.callCount(), 1);
  });

  it('creates a mainnet client when specified', () => {
    const client = getClient('mainnet');
    assert.ok(client);
    assert.equal(mockForMainnet.mock.callCount(), 1);
  });

  it('caches client on subsequent calls', () => {
    getClient('testnet');
    getClient('testnet');
    // Should only create once
    assert.equal(mockForTestnet.mock.callCount(), 1);
  });

  it('throws when env vars are missing', () => {
    delete process.env.HEDERA_OPERATOR_ID;
    delete process.env.HEDERA_OPERATOR_KEY;
    closeClient(); // Clear cache
    assert.throws(
      () => getClient(),
      { message: 'Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY environment variables' },
    );
    // Restore
    if (origOpId !== undefined) process.env.HEDERA_OPERATOR_ID = origOpId;
    if (origOpKey !== undefined) process.env.HEDERA_OPERATOR_KEY = origOpKey;
  });

  it('closeClient closes specific network', () => {
    getClient('testnet');
    closeClient('testnet');
    // Creating again should make a new client
    getClient('testnet');
    assert.equal(mockForTestnet.mock.callCount(), 2);
  });

  it('closeClient with no args closes all clients', () => {
    getClient('testnet');
    closeClient();
    getClient('testnet');
    assert.equal(mockForTestnet.mock.callCount(), 2);
  });
});
