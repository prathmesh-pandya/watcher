import { z } from 'zod';

/**
 * Every secret comes from the environment (requirement #5). Anything listed as
 * required here has no fallback -- the process refuses to boot without it
 * rather than silently running with a dev default.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  PORT: z.coerce.number().int().positive().default(4000),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  API_TOKEN: z.string().min(16, 'API_TOKEN must be at least 16 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  /** Fallback secret for repos whose RepoConfig has none of its own. */
  GITHUB_WEBHOOK_SECRET: z.string().min(1).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid server environment:\n${issues}\n\nCopy .env.example to .env at the repo root.`);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
};
