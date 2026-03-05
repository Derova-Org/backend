/**
 * GET /health — liveness check.
 * GET /ready  — readiness check (DB connectivity).
 */

import { Router } from 'express';
import { query } from '../storage/db.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

healthRouter.get('/ready', async (_req, res) => {
  if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
    res.json({ status: 'ok', db: 'not configured' });
    return;
  }
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';
    res.status(503).json({ status: 'error', reason });
  }
});
