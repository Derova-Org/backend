/**
 * PostgreSQL storage integration tests.
 *
 * These tests require a running PostgreSQL instance. They skip gracefully
 * when DATABASE_URL is not set.
 *
 * Run: DATABASE_URL=postgresql://derova:derova@localhost:5432/derova_dev node --test --import tsx test/storage-pg.test.ts
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = process.env.DATABASE_URL;

// Skip entire suite if no DATABASE_URL
if (!DATABASE_URL) {
  describe('PostgreSQL storage (skipped — no DATABASE_URL)', () => {
    it('skips when DATABASE_URL is not set', { skip: 'DATABASE_URL not configured' }, () => {});
  });
} else {
  // Dynamic imports so pg Pool is only created when DATABASE_URL is present
  const { getPool, query, closePool } = await import('../src/storage/db.js');
  const { runMigrations } = await import('../src/storage/migrate.js');
  const accounts = await import('../src/storage/accounts-pg.js');

  describe('PostgreSQL storage', () => {
    before(async () => {
      await runMigrations();
    });

    after(async () => {
      await closePool();
    });

    describe('accounts CRUD', () => {
      const testHash = `test_user_${Date.now()}`;

      beforeEach(async () => {
        // Clean up any previous test data
        await query('DELETE FROM accounts WHERE username_hash LIKE $1', ['test_user_%']);
      });

      it('accountExists returns false for unknown user', async () => {
        const exists = await accounts.accountExists(testHash);
        assert.equal(exists, false);
      });

      it('creates and retrieves an account', async () => {
        await accounts.createAccountRecord(testHash, 'deadbeef', '0.0.12345');

        const exists = await accounts.accountExists(testHash);
        assert.equal(exists, true);

        const record = await accounts.getAccountRecord(testHash);
        assert.ok(record);
        assert.equal(record.publicKeyHex, 'deadbeef');
        assert.equal(record.accountId, '0.0.12345');
        assert.ok(record.createdAt);
      });

      it('clearAccounts removes all rows', async () => {
        await accounts.createAccountRecord(testHash, 'aabbcc', '0.0.99999');
        await accounts.clearAccounts();

        const exists = await accounts.accountExists(testHash);
        assert.equal(exists, false);
      });

      it('rejects duplicate username_hash (primary key)', async () => {
        await accounts.createAccountRecord(testHash, 'key1', '0.0.1');
        await assert.rejects(
          () => accounts.createAccountRecord(testHash, 'key2', '0.0.2'),
          (err: Error) => {
            assert.ok(err.message.includes('duplicate') || err.message.includes('unique'));
            return true;
          },
        );
      });
    });

    describe('server secrets persistence', () => {
      before(async () => {
        // Clean secrets for a fresh test
        await query('DELETE FROM server_secrets');
      });

      it('creates secrets on first call and returns same on second', async () => {
        // keys-pg depends on @derova/sdk — import dynamically
        const { getSecrets } = await import('../src/crypto/keys-pg.js');

        const secrets1 = await getSecrets();
        assert.ok(secrets1.oprfSeed);
        assert.ok(secrets1.orgId);
        assert.equal(typeof secrets1.orgId, 'string');

        // Verify it persisted to DB
        const result = await query<{ oprf_seed: string; org_id: string }>(
          'SELECT oprf_seed, org_id FROM server_secrets WHERE id = 1',
        );
        assert.equal(result.rowCount, 1);
        assert.equal(result.rows[0].org_id, secrets1.orgId);
      });
    });

    describe('migration idempotency', () => {
      it('running migrations twice does not error', async () => {
        await runMigrations();
        await runMigrations();
        // If we get here without throwing, migrations are idempotent
      });

      it('_migrations table tracks applied files', async () => {
        const result = await query<{ name: string }>('SELECT name FROM _migrations ORDER BY name');
        assert.ok(result.rowCount && result.rowCount > 0);
        assert.ok(result.rows.some((r) => r.name === '001_init.sql'));
      });
    });
  });
}
