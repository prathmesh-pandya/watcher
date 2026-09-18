import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/**
 * Loads the single .env at the monorepo root, so server and worker share one
 * file. Walks upward from this module rather than relying on process.cwd(),
 * which differs between `npm run dev -w ...` and running the built dist.
 *
 * (Node's built-in --env-file would be simpler but needs Node >= 20.6; this
 * works on the Node 18 baseline in package.json#engines.)
 *
 * MUST be imported before any module that reads process.env -- which is why
 * it's the first import in index.ts.
 */
function findRootEnv(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const envPath = findRootEnv();
if (envPath) {
  config({ path: envPath });
} else {
  // Not fatal: in a container the environment is usually injected directly.
  console.warn('[loadEnv] no .env file found; relying on the ambient environment');
}
