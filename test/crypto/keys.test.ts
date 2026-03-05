/**
 * Unit tests for file-backed server secrets (crypto/keys.ts).
 *
 * Mocks fs and @derova/sdk so no real files or crypto are needed.
 * Uses Node's built-in test runner + mock.module().
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock dependencies BEFORE importing keys
// ---------------------------------------------------------------------------

let fileContents: Record<string, string> = {};

mock.module('node:fs', {
  namedExports: {
    existsSync: mock.fn((path: string) => path in fileContents),
    readFileSync: mock.fn((path: string) => {
      if (!(path in fileContents)) throw new Error(`ENOENT: ${path}`);
      return fileContents[path];
    }),
    writeFileSync: mock.fn((path: string, data: string) => {
      fileContents[path] = data;
    }),
    mkdirSync: mock.fn(),
  },
});

const mockGenerateServerSecret = mock.fn(() => BigInt(42));
const mockScalarToHex = mock.fn((s: bigint) => s.toString(16));
const mockHexToScalar = mock.fn((h: string) => BigInt(`0x${h}`));
const mockRandomBytes = mock.fn((n: number) => new Uint8Array(n).fill(0xab));
const mockBytesToHex = mock.fn(() => 'ab'.repeat(16));

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

const keys = await import('../../src/crypto/keys.js');

describe('File-backed server secrets (keys.ts)', () => {
  it('generates new secrets when file does not exist', () => {
    // The module loaded with no files in our mock store, so it should have generated
    const secrets = keys.getSecrets();
    assert.equal(secrets.oprfSeed, BigInt(42));
    assert.ok(secrets.orgId);
    assert.equal(mockGenerateServerSecret.mock.callCount() >= 1, true);
  });

  it('returns cached secrets on subsequent calls', () => {
    const s1 = keys.getSecrets();
    const s2 = keys.getSecrets();
    assert.equal(s1, s2); // Same reference (cached)
  });
});
