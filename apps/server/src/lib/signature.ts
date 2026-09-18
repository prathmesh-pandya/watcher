import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies GitHub's X-Hub-Signature-256 header against the *raw* request body.
 *
 * The body must be the exact bytes GitHub sent -- re-serialising the parsed
 * JSON changes key order and whitespace and the HMAC will not match. That's why
 * the webhook route mounts express.raw() instead of express.json().
 */
export function verifyGithubSignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(signatureHeader, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  // Length check first: timingSafeEqual throws on mismatched lengths.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
