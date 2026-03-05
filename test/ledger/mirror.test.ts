/**
 * Unit tests for mirror node queries (ledger/mirror.ts).
 *
 * Mocks global fetch so no real HTTP requests are made.
 * Uses Node's built-in test runner + mock.module().
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
const mockFetch = mock.fn<typeof globalThis.fetch>();

mock.module('../../src/logger.js', {
  defaultExport: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
  },
});

const { getAccountBalance, getTransactionHistory } = await import('../../src/ledger/mirror.js');

describe('Mirror node queries', () => {
  beforeEach(() => {
    mockFetch.mock.resetCalls();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
  });

  // Restore after all tests
  // Note: can't use after() easily with globalThis, but tests are isolated

  describe('getAccountBalance', () => {
    it('returns parsed balance for valid response', async () => {
      mockFetch.mock.mockImplementation(async () =>
        new Response(JSON.stringify({
          balances: [{
            account: '0.0.12345',
            balance: 500,
            tokens: [{ token_id: '0.0.1', balance: 10 }],
          }],
        }), { status: 200 }),
      );

      const result = await getAccountBalance('0.0.12345', 'testnet');
      assert.equal(result.account, '0.0.12345');
      assert.equal(result.balance, 500);
      assert.equal(result.tokens.length, 1);
      assert.equal(result.tokens[0].token_id, '0.0.1');
    });

    it('uses testnet URL by default', async () => {
      mockFetch.mock.mockImplementation(async (url: any) => {
        assert.ok(String(url).includes('testnet.mirrornode.hedera.com'));
        return new Response(JSON.stringify({
          balances: [{ account: '0.0.1', balance: 0, tokens: [] }],
        }), { status: 200 });
      });

      await getAccountBalance('0.0.1');
    });

    it('uses mainnet URL when specified', async () => {
      mockFetch.mock.mockImplementation(async (url: any) => {
        assert.ok(String(url).includes('mainnet.mirrornode.hedera.com'));
        return new Response(JSON.stringify({
          balances: [{ account: '0.0.1', balance: 0, tokens: [] }],
        }), { status: 200 });
      });

      await getAccountBalance('0.0.1', 'mainnet');
    });

    it('throws when response is not ok', async () => {
      mockFetch.mock.mockImplementation(async () =>
        new Response('error', { status: 500 }),
      );

      await assert.rejects(
        () => getAccountBalance('0.0.1'),
        { message: 'Mirror node balance query failed: 500' },
      );
    });

    it('throws when no balances found', async () => {
      mockFetch.mock.mockImplementation(async () =>
        new Response(JSON.stringify({ balances: [] }), { status: 200 }),
      );

      await assert.rejects(
        () => getAccountBalance('0.0.999'),
        { message: 'No balance found for account 0.0.999' },
      );
    });

    it('handles missing tokens array gracefully', async () => {
      mockFetch.mock.mockImplementation(async () =>
        new Response(JSON.stringify({
          balances: [{ account: '0.0.1', balance: 100 }],
        }), { status: 200 }),
      );

      const result = await getAccountBalance('0.0.1');
      assert.deepEqual(result.tokens, []);
    });
  });

  describe('getTransactionHistory', () => {
    it('returns parsed transactions', async () => {
      mockFetch.mock.mockImplementation(async () =>
        new Response(JSON.stringify({
          transactions: [
            {
              transaction_id: 'tx-1',
              name: 'CRYPTOTRANSFER',
              result: 'SUCCESS',
              consensus_timestamp: '1234567890.000',
              extra_field: 'ignored',
            },
          ],
        }), { status: 200 }),
      );

      const result = await getTransactionHistory('0.0.1');
      assert.equal(result.length, 1);
      assert.equal(result[0].transaction_id, 'tx-1');
      assert.equal(result[0].name, 'CRYPTOTRANSFER');
      assert.equal(result[0].result, 'SUCCESS');
    });

    it('throws when response is not ok', async () => {
      mockFetch.mock.mockImplementation(async () =>
        new Response('error', { status: 404 }),
      );

      await assert.rejects(
        () => getTransactionHistory('0.0.1'),
        { message: 'Mirror node transaction query failed: 404' },
      );
    });

    it('returns empty array when no transactions', async () => {
      mockFetch.mock.mockImplementation(async () =>
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const result = await getTransactionHistory('0.0.1');
      assert.deepEqual(result, []);
    });

    it('respects custom limit parameter', async () => {
      mockFetch.mock.mockImplementation(async (url: any) => {
        assert.ok(String(url).includes('limit=5'));
        return new Response(JSON.stringify({ transactions: [] }), { status: 200 });
      });

      await getTransactionHistory('0.0.1', 'testnet', 5);
    });
  });
});
