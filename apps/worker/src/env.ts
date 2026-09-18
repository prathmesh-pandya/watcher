import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required to call the compare API'),
  GITHUB_API_BASE: z.string().default('https://api.github.com'),

  // Still read by the generateTestCases stub; that pass is not yet implemented.
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5'),

  // MiniMax, used by updateFeatureDoc via its OpenAI-compatible endpoint.
  MINIMAX_API_KEY: z.string().optional(),
  MINIMAX_MODEL: z.string().default('MiniMax-M3'),
  // Must match the account's platform -- international vs domestic endpoints
  // are distinct and the wrong one fails auth with a valid key.
  MINIMAX_BASE_URL: z.string().default('https://api.minimax.io/v1'),

  MAX_DIFF_CHARS: z.coerce.number().int().positive().default(180_000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(2),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid worker environment:\n${issues}\n\nCopy .env.example to .env at the repo root.`);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
};
