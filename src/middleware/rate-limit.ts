import rateLimit from 'express-rate-limit';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const isTest = process.env.NODE_ENV === 'test';
const skipAll = () => true;

const authLimit = parseInt(process.env.RATE_LIMIT_AUTH || '20', 10);
const generalLimit = parseInt(process.env.RATE_LIMIT_GENERAL || '100', 10);

/** Strict limit for registration endpoints: 10 req / 15 min per IP */
export const registerLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: Math.min(authLimit, 10),
  skip: isTest ? skipAll : undefined,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/** Strict limit for login endpoints: 20 req / 15 min per IP */
export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: authLimit,
  skip: isTest ? skipAll : undefined,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/** Limit for logout endpoint: 30 req / 15 min per IP */
export const logoutLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 30,
  skip: isTest ? skipAll : undefined,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/** General limit for all other endpoints: 100 req / 15 min per IP */
export const generalLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: generalLimit,
  skip: isTest ? skipAll : undefined,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
