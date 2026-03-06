import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const isLocal = !process.env.DATABASE_URL;
    const base = isLocal
      ? {
          host: process.env.PGHOST || 'localhost',
          port: parseInt(process.env.PGPORT || '5432', 10),
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          database: process.env.PGDATABASE,
        }
      : { connectionString: process.env.DATABASE_URL };
    pool = new Pool({
      ...base,
      ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
