/**
 * Unit tests for PostgreSQL-backed server secrets (crypto/keys-pg.ts).
 *
 * Mocks db query and @derova/sdk so no real DB or crypto needed.
 * Uses Node's built-in test runner + mock.module().
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing keys-pg
// ---------------------------------------------------------------------------

const mockQuery = mock.fn(async () => ({ rows: [], rowCount: 0 }));

mock.module('../../src/storage/db.js', {
  namedExports: {
    query: mockQuery,
    getPool: mock.fn(() => ({})),
    closePool: mock.fn(async () => {}),
  },
});

const mockGenerateServerSecret = mock.fn(() => BigInt(99));
const mockScalarToHex = mock.fn((s: bigint) => s.toString(16));
const mockHexToScalar = mock.fn((h: string) => BigInt(`0x${h}`));
const mockRandomBytes = mock.fn((n: number) => new Uint8Array(n).fill(0xcd));
const mockBytesToHex = mock.fn(() => 'cd'.repeat(16));

mock.module('@derova/sdk', {
  namedExports: {
    generateServerSecret: mockGenerateServerSecret,
    scalarToHex: mockScalarToHex,
    hexToScalar: mockHexToScalar,
    randomBytes: mockRandomBytes,
    bytesToHex: mockBytesToHex,
    hashUsername: mock.fn(),
    verifySignature: mock.fn(),
    hexToBytes: mock.fn(),
    deriveOprfKey: mock.fn(),
    oprfEvaluate: mock.fn(),
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

const keysPg = await import('../../src/crypto/keys-pg.js');

describe('PostgreSQL-backed server secrets (keys-pg.ts)', () => {
  beforeEach(() => {
    mockQuery.mock.resetCalls();
  });

  it('generates new secrets when DB has no rows', async () => {
    mockQuery.mock.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const secrets = await keysPg.getSecrets();
    assert.ok(secrets.oprfSeed);
    assert.ok(secrets.orgId);
    // Should have done a SELECT then an INSERT
    assert.ok(mockQuery.mock.callCount() >= 1);
  });

  it('returns cached secrets on subsequent calls', async () => {
    const s1 = await keysPg.getSecrets();
    const s2 = await keysPg.getSecrets();
    assert.equal(s1, s2); // Same reference
  });
});
