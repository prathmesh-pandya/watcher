import express, { type ErrorRequestHandler, type Express } from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { env } from './env.js';
import { logger } from './logger.js';
import { requireApiToken } from './middleware/auth.js';
import { healthRouter } from './routes/health.js';
import { webhookRouter } from './routes/webhook.js';
import { reposRouter } from './routes/repos.js';
import { featuresRouter } from './routes/features.js';
import { testCasesRouter } from './routes/testCases.js';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  // Request id + one access log line per request.
  app.use((req, res, next) => {
    const requestId = req.get('x-request-id') ?? randomUUID();
    res.setHeader('x-request-id', requestId);
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.debug(
        { requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationMs) },
        'request',
      );
    });
    next();
  });

  app.use(cors({ origin: env.corsOrigins, credentials: false }));

  // Unauthenticated: health for probes, webhook for GitHub (HMAC-authenticated).
  // Mounted BEFORE express.json() so the webhook keeps its raw body.
  app.use('/health', healthRouter);
  app.use('/webhooks', webhookRouter);

  app.use(express.json({ limit: '1mb' }));

  // Everything under /api sits behind the shared token.
  app.use('/api', requireApiToken);
  app.use('/api/repos', reposRouter);
  app.use('/api/features', featuresRouter);
  app.use('/api/test-cases', testCasesRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    const requestId = res.getHeader('x-request-id');
    logger.error({ err, requestId, path: req.path }, 'unhandled error');
    if (res.headersSent) return;
    res.status(500).json({
      error: 'internal_error',
      ...(env.isProduction ? {} : { detail: (err as Error).message }),
    });
  };
  app.use(errorHandler);

  return app;
}
