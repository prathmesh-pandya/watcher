import type {
  FeatureDoc,
  Paginated,
  RepoConfig,
  RepoConfigInput,
  TestCase,
  TestCaseStatus,
} from '@watcher/shared';

/**
 * The shared token (requirement #7) is kept in localStorage and set on the
 * Settings page. This is an internal tool -- the token gates the API, the
 * browser just carries it.
 */
const TOKEN_KEY = 'watcher.apiToken';

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode -- the token just won't persist */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };

  if (!res.ok) {
    const message =
      res.status === 401
        ? 'Unauthorised — set the API token on the Settings page.'
        : body.detail || body.error || `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return body as T;
}

export const api = {
  health: () => request<{ ok: boolean; mongo: string; redis: string }>('/health'),

  listRepos: () => request<Paginated<RepoConfig>>('/api/repos'),
  createRepo: (input: RepoConfigInput) =>
    request<RepoConfig>('/api/repos', { method: 'POST', body: JSON.stringify(input) }),
  updateRepo: (id: string, input: Partial<RepoConfigInput>) =>
    request<RepoConfig>(`/api/repos/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteRepo: (id: string) => request<void>(`/api/repos/${id}`, { method: 'DELETE' }),

  listFeatureDocs: (repo?: string) =>
    request<Paginated<FeatureDoc>>(`/api/features${repo ? `?repo=${encodeURIComponent(repo)}` : ''}`),

  listTestCases: (params: { repo?: string; status?: TestCaseStatus } = {}) => {
    const query = new URLSearchParams();
    if (params.repo) query.set('repo', params.repo);
    if (params.status) query.set('status', params.status);
    const qs = query.toString();
    return request<Paginated<TestCase>>(`/api/test-cases${qs ? `?${qs}` : ''}`);
  },
  setTestCaseStatus: (id: string, status: TestCaseStatus) =>
    request<TestCase>(`/api/test-cases/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
