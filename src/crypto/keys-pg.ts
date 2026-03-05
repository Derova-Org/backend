import { query } from '../storage/db.js';
import { generateServerSecret, scalarToHex, hexToScalar, randomBytes, bytesToHex } from '@derova/sdk';
import type { ServerSecrets } from './keys.js';
import logger from '../logger.js';

let cached: ServerSecrets | null = null;

export async function getSecrets(): Promise<ServerSecrets> {
  if (cached) return cached;

  const result = await query<{ oprf_seed: string; org_id: string }>(
    'SELECT oprf_seed, org_id FROM server_secrets WHERE id = 1',
  );

  if (result.rowCount && result.rowCount > 0) {
    const row = result.rows[0];
    cached = {
      oprfSeed: hexToScalar(row.oprf_seed),
      orgId: row.org_id,
    };
  } else {
    const oprfSeed = generateServerSecret();
    const orgId = bytesToHex(randomBytes(16));
    await query(
      'INSERT INTO server_secrets (id, oprf_seed, org_id) VALUES (1, $1, $2)',
      [scalarToHex(oprfSeed), orgId],
    );
    cached = { oprfSeed, orgId };
    logger.info('Generated new server secrets → PostgreSQL');
  }

  return cached;
}
