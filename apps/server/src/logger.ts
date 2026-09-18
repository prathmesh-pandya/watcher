import pino from 'pino';
import { env } from './env.js';

/**
 * Structured logging (requirement #6). One JSON line per event in production;
 * pino-pretty in dev so the webhook/job trail is readable in a terminal.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { app: 'server' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-token"]', 'req.headers["x-hub-signature-256"]'],
    censor: '[redacted]',
  },
  ...(env.isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } } }),
});

export type Logger = typeof logger;
