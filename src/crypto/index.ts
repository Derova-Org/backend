export type { ServerSecrets } from './keys.js';
export { deriveOprfKey, oprfEvaluate, verifySignature } from '@derova/sdk';

import * as fileBacked from './keys.js';
import * as pgBacked from './keys-pg.js';

const usePg = !!process.env.DATABASE_URL;

export async function getSecrets(): Promise<fileBacked.ServerSecrets> {
  if (usePg) return pgBacked.getSecrets();
  return fileBacked.getSecrets();
}
