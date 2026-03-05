/**
 * Unit tests for Hedera transaction submission (ledger/submit.ts).
 *
 * Mocks @hashgraph/sdk so no real Hedera transactions are executed.
 * Uses Node's built-in test runner + mock.module().
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock @hashgraph/sdk BEFORE importing submit
// ---------------------------------------------------------------------------

const mockExecute = mock.fn();
const mockGetReceipt = mock.fn();
const mockSetKey = mock.fn();
const mockSetInitialBalance = mock.fn();

function MockAccountCreateTransaction() {
  return {
    setKeyWithoutAlias: mock.fn(function (this: any) { mockSetKey(); return this; }),
    setInitialBalance: mock.fn(function (this: any) { mockSetInitialBalance(); return this; }),
    execute: mockExecute,
  };
}

mock.module('@hashgraph/sdk', {
  namedExports: {
    AccountCreateTransaction: MockAccountCreateTransaction,
    Hbar: class Hbar { constructor(public amount: number) {} },
    PublicKey: {
      fromStringED25519: mock.fn((hex: string) => `pubkey_${hex}`),
    },
    Client: {
      forTestnet: mock.fn(() => ({})),
    },
    PrivateKey: {
      fromStringDer: mock.fn(),
    },
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

const { createAccount } = await import('../../src/ledger/submit.js');

describe('Hedera submit (submit.ts)', () => {
  it('creates an account and returns the account ID', async () => {
    const mockAccountId = { toString: () => '0.0.54321' };
    mockGetReceipt.mock.mockImplementation(async () => ({ accountId: mockAccountId }));
    mockExecute.mock.mockImplementation(async () => ({ getReceipt: mockGetReceipt }));

    const result = await createAccount({} as any, 'aa'.repeat(32), 5);
    assert.equal(result, '0.0.54321');
    assert.equal(mockExecute.mock.callCount(), 1);
  });

  it('throws when receipt has no account ID', async () => {
    mockGetReceipt.mock.mockImplementation(async () => ({ accountId: null }));
    mockExecute.mock.mockImplementation(async () => ({ getReceipt: mockGetReceipt }));

    await assert.rejects(
      () => createAccount({} as any, 'bb'.repeat(32)),
      { message: 'Hedera account creation failed — no account ID in receipt' },
    );
  });
});
