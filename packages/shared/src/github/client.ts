/**
 * Authenticated calls to the GitHub REST API.
 *
 * This lives in the shared package because two apps need it for different
 * reasons: the worker fetches the diff for a push, and the API server resolves
 * a branch's current HEAD when baseline documentation is ingested. Credentials
 * are passed in rather than read from process.env -- each app validates its own
 * environment and owns the error message when the token is missing.
 */

export interface GitHubAuth {
  /** PAT with `repo` (private) or `public_repo` scope. */
  token: string;
  /** Overridable for GitHub Enterprise; defaults to the public API. */
  apiBase?: string;
}

const DEFAULT_API_BASE = 'https://api.github.com';

/** The API root with any trailing slash removed, so callers can concatenate. */
export function githubApiBase(auth: GitHubAuth): string {
  return (auth.apiBase ?? DEFAULT_API_BASE).replace(/\/+$/, '');
}

export function githubHeaders(auth: GitHubAuth, accept: string): Record<string, string> {
  return {
    accept,
    authorization: `Bearer ${auth.token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'repo-watcher',
  };
}

/**
 * GET `url`, throwing on any non-2xx with a trimmed slice of the response body
 * -- GitHub puts the useful part (bad credentials, no such branch) up front.
 */
export async function githubFetch(
  auth: GitHubAuth,
  url: string,
  accept = 'application/vnd.github+json',
): Promise<Response> {
  const res = await fetch(url, { headers: githubHeaders(auth, accept) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status} ${res.statusText} for ${url}: ${body.slice(0, 400)}`);
  }
  return res;
}

export async function githubJson<T>(auth: GitHubAuth, url: string): Promise<T> {
  const res = await githubFetch(auth, url);
  return (await res.json()) as T;
}

/**
 * The SHA currently at the tip of `branch`.
 *
 * Uses the commits endpoint rather than /branches because it accepts any ref
 * name and returns the same `sha` field -- and because a branch name with a
 * slash in it (`release/2.0`) works here without escaping games.
 */
export async function fetchBranchHeadSha(
  auth: GitHubAuth,
  params: { owner: string; name: string; branch: string },
): Promise<string> {
  const { owner, name, branch } = params;
  const url = `${githubApiBase(auth)}/repos/${owner}/${name}/commits/${encodeURIComponent(branch)}`;
  const body = await githubJson<{ sha?: string }>(auth, url);

  if (!body.sha) {
    throw new Error(`GitHub returned no commit SHA for ${owner}/${name}@${branch}`);
  }
  return body.sha;
}
