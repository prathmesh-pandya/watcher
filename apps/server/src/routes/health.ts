import { Router } from 'express';
import mongoose from 'mongoose';
import { redis } from '../lib/queue.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const healthRouter: Router = Router();

// mongoose readyState: 0-3 plus 99 (uninitialized).
const MONGO_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

/**
 * GET /health -- unauthenticated on purpose so a load balancer or `curl` can
 * hit it. Reports dependency state but always 200s unless something is down.
 */
healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const mongoState = MONGO_STATES[mongoose.connection.readyState] ?? 'unknown';

    let redisState = 'unknown';
    try {
      redisState = (await redis.ping()) === 'PONG' ? 'connected' : 'unexpected_reply';
    } catch (err) {
      redisState = `error: ${(err as Error).message}`;
    }

    const healthy = mongoState === 'connected' && redisState === 'connected';

    res.status(healthy ? 200 : 503).json({
      ok: healthy,
      uptimeSeconds: Math.round(process.uptime()),
      mongo: mongoState,
      redis: redisState,
      timestamp: new Date().toISOString(),
    });
  }),
);
