import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../env.js';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Minimal shared-token guard (requirement #7). This is an internal tool behind
 * a single token -- not per-user auth. Accepts either header:
 *   Authorization: Bearer <token>
 *   x-api-token: <token>
 *
 * The webhook route is deliberately NOT behind this: GitHub authenticates with
 * an HMAC signature instead.
 */
export function requireApiToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.get('authorization');
  const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  const provided = bearer ?? req.get('x-api-token') ?? null;

  if (!provided) {
    res.status(401).json({ error: 'missing_token', detail: 'Provide the shared token via Authorization: Bearer or x-api-token.' });
    return;
  }

  if (!safeEqual(provided, env.API_TOKEN)) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  next();
}
