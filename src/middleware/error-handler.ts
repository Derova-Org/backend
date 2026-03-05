import type { Request, Response, NextFunction } from 'express';
import logger from '../logger.js';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Centralised Express error-handling middleware.
 * Must be registered AFTER all routes with 4 arguments so Express recognises it.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = res.getHeader('X-Request-Id') as string | undefined;

  // Determine HTTP status
  let status = 500;
  let message = 'Internal server error';

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    if (err.name === 'ValidationError' || msg.includes('invalid') || msg.includes('required') || msg.includes('missing')) {
      status = 400;
      message = isProd ? 'Bad request' : err.message;
    } else if (msg.includes('unauthorized') || msg.includes('invalid signature') || msg.includes('invalid token')) {
      status = 401;
      message = 'Unauthorized';
    } else if (msg.includes('not found')) {
      status = 404;
      message = 'Not found';
    } else if (msg.includes('not allowed by cors')) {
      status = 403;
      message = 'Forbidden';
    }

    logger.error(
      {
        requestId,
        method: req.method,
        path: req.path,
        status,
        err: {
          name: err.name,
          message: err.message,
          stack: err.stack,
        },
      },
      'unhandled error',
    );
  } else {
    logger.error({ requestId, method: req.method, path: req.path, status, err }, 'unhandled non-Error thrown');
  }

  if (!res.headersSent) {
    res.status(status).json({ error: message, ...(requestId ? { requestId } : {}) });
  }
}

/**
 * Catch-all 404 handler. Register this just before errorHandler.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}

/**
 * Register process-level handlers for uncaught exceptions and unhandled rejections.
 * Call once at startup (in the main entry point only).
 */
export function registerProcessHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandledRejection');
  });

  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaughtException — process will exit');
    process.exit(1);
  });
}
