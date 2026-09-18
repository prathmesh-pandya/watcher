/** Parsing helpers used by both the API (on save) and the webhook route. */

export interface ParsedRepoUrl {
  owner: string;
  name: string;
  fullName: string;
}

/**
 * Accepts the forms GitHub hands out -- https URL, .git suffix, ssh remote, or
 * a bare `owner/name` -- and normalises to `owner/name`.
 * Returns null when the input isn't a recognisable GitHub repo reference.
 */
export function parseRepoUrl(input: string): ParsedRepoUrl | null {
  const trimmed = input.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!trimmed) return null;

  const patterns = [
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)$/i,
    /^git@github\.com:([^/\s]+)\/([^/\s]+)$/i,
    /^([\w.-]+)\/([\w.-]+)$/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(trimmed);
    if (match?.[1] && match[2]) {
      const owner = match[1];
      const name = match[2];
      return { owner, name, fullName: `${owner}/${name}` };
    }
  }
  return null;
}

/** GitHub sends this as `before` when a branch is created -- there's no base. */
export const NULL_SHA = '0000000000000000000000000000000000000000';

export function isNullSha(sha: string): boolean {
  return !sha || /^0+$/.test(sha);
}

/** `refs/heads/main` -> `main`. Returns null for tags and other ref types. */
export function branchFromRef(ref: string): string | null {
  const prefix = 'refs/heads/';
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
}
