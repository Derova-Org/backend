/**
 * GET /balances/:accountId — mirror-node balance query.
 *
 * New for Derova — the reference project has no balance queries.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { fetchBalance } from '../services/balance.js';
import { isValidSession } from '../services/account.js';

export const balancesRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !isValidSession(token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

balancesRouter.get('/balances/:accountId', requireAuth, async (req, res) => {
  const { accountId } = req.params;
  try {
    const data = await fetchBalance(accountId as string);
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Failed to fetch balance from mirror node' });
  }
});
