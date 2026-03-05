import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPool } from './db.js';
import logger from '../logger.js';

const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../migrations');

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const applied = await pool.query<{ name: string }>('SELECT name FROM _migrations ORDER BY name');
  const appliedSet = new Set(applied.rows.map((r) => r.name));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await pool.query('COMMIT');
      logger.info({ file }, 'Migration applied');
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }
}
