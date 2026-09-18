import { isNullSha } from '@watcher/shared';
import { env } from '../env.js';
import { logger } from '../logger.js';

export interface ChangedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  previousFilename?: string;
}

export interface RepoDiff {
  repoFullName: string;
  baseSha: string;
  headSha: string;
  /** Unified diff text, possibly truncated to MAX_DIFF_CHARS. */
  diff: string;
  truncated: boolean;
  files: ChangedFile[];
  commitMessages: string[];
  compareUrl: string | null;
}

function ghHeaders(accept: string): Record<string, string> {
  return {
    accept,
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'repo-watcher',
  };
}

async function ghFetch(url: string, accept: string): Promise<Response> {
  const res = await fetch(url, { headers: ghHeaders(accept) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status} ${res.statusText} for ${url}: ${body.slice(0, 400)}`);
  }
  return res;
}

/**
 * Fetches the diff for a push using GitHub's compare API.
 *
 * Two calls, because the two representations are both useful:
 *  - `application/vnd.github.v3.diff` gives the raw unified diff, which is what
 *    the model actually reasons over.
 *  - the default JSON gives the file list and commit messages, which are handy
 *    for logging and for the doc revision summary without parsing the diff.
 *
 * When `before` is the all-zeroes SHA (branch just created) there is no base to
 * compare against, so we fall back to the head commit on its own.
 */
export async function fetchPushDiff(params: {
  owner: string;
  name: string;
  beforeSha: string;
  afterSha: string;
}): Promise<RepoDiff> {
  const { owner, name, beforeSha, afterSha } = params;
  const repoFullName = `${owner}/${name}`;
  const base = `${env.GITHUB_API_BASE}/repos/${owner}/${name}`;

  const isInitialPush = isNullSha(beforeSha);
  const url = isInitialPush ? `${base}/commits/${afterSha}` : `${base}/compare/${beforeSha}...${afterSha}`;

  logger.debug({ repoFullName, url, isInitialPush }, 'fetching diff from GitHub');

  const [diffRes, jsonRes] = await Promise.all([
    ghFetch(url, 'application/vnd.github.v3.diff'),
    ghFetch(url, 'application/vnd.github+json'),
  ]);

  const rawDiff = await diffRes.text();
  const meta = (await jsonRes.json()) as {
    files?: ChangedFile[];
    commits?: { commit?: { message?: string } }[];
    commit?: { message?: string };
    html_url?: string;
  };

  const truncated = rawDiff.length > env.MAX_DIFF_CHARS;
  const diff = truncated
    ? `${rawDiff.slice(0, env.MAX_DIFF_CHARS)}\n\n[... diff truncated at ${env.MAX_DIFF_CHARS} characters ...]`
    : rawDiff;

  const commitMessages = isInitialPush
    ? [meta.commit?.message].filter((m): m is string => Boolean(m))
    : (meta.commits ?? []).map((c) => c.commit?.message).filter((m): m is string => Boolean(m));

  return {
    repoFullName,
    baseSha: isInitialPush ? afterSha : beforeSha,
    headSha: afterSha,
    diff,
    truncated,
    files: meta.files ?? [],
    commitMessages,
    compareUrl: meta.html_url ?? null,
  };
}
