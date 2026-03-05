import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { healthRouter, accountsRouter, balancesRouter } from './routes';
import { closePool } from './storage/db.js';
import { runMigrations } from './storage/migrate.js';
import logger from './logger.js';
import { generalLimiter } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler, registerProcessHandlers } from './middleware/error-handler.js';

export function createApp() {
  const app = express();

  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5180')
    .split(',')
    .map((o) => o.trim());

  app.use(
    cors({
      origin(origin, callback) {
        // Allow requests with no origin (e.g. server-to-server, curl)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false, // CSP not needed for an API server
      frameguard: { action: 'deny' },
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );

  app.use(express.json());

  // Health endpoints before rate limiter — must not be rate-limited
  app.use(healthRouter);

  app.use(generalLimiter);

  // X-Request-Id + request logging — skip health endpoints to avoid log noise
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-Id', requestId);
    if (req.path === '/health' || req.path === '/ready') return next();
    const start = Date.now();
    res.on('finish', () => {
      logger.info({
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - start,
      }, 'request');
    });
    next();
  });
  app.use(accountsRouter);
  app.use(balancesRouter);

  // 404 catch-all and centralised error handler — must be last
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];

if (isMain) {
  registerProcessHandlers();

  const PORT = parseInt(process.env.PORT || '3000', 10);
  const app = createApp();

  if (process.env.DATABASE_URL) {
    await runMigrations();
  }

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, `Derova backend listening`);
  });

  async function shutdown() {
    logger.info('Shutting down...');
    server.close();
    await closePool();
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
