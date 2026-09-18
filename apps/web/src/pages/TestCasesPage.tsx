import { useState } from 'react';
import {
  TEST_CASE_STATUSES,
  TEST_CASE_STATUS_LABELS,
  type TestCase,
  type TestCaseStatus,
} from '@watcher/shared';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { EmptyState, ErrorState, Loading } from '../components/States.js';

export function TestCasesPage() {
  const [repo, setRepo] = useState('');
  const [status, setStatus] = useState<TestCaseStatus | ''>('');

  const repos = useApi(() => api.listRepos(), []);
  const testCases = useApi(
    () => api.listTestCases({ repo: repo || undefined, status: status || undefined }),
    [repo, status],
  );

  // Optimistic status toggles, keyed by id, so the checklist feels instant.
  const [overrides, setOverrides] = useState<Record<string, TestCaseStatus>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function changeStatus(tc: TestCase, next: TestCaseStatus) {
    const previous = overrides[tc.id] ?? tc.status;
    setOverrides((o) => ({ ...o, [tc.id]: next }));
    setSaving(tc.id);
    try {
      await api.setTestCaseStatus(tc.id, next);
    } catch {
      setOverrides((o) => ({ ...o, [tc.id]: previous }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Test Cases</h1>
        <p className="page__subtitle">QA checklist generated from each push. Toggle status as you work through it.</p>
      </div>

      <div className="filters">
        <label>
          Repo
          <select value={repo} onChange={(e) => setRepo(e.target.value)}>
            <option value="">All repos</option>
            {(repos.data?.items ?? []).map((r) => (
              <option key={r.id} value={r.fullName}>
                {r.fullName} ({r.type})
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as TestCaseStatus | '')}>
            <option value="">All statuses</option>
            {TEST_CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TEST_CASE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="btn" onClick={testCases.reload}>
          Refresh
        </button>
      </div>

      {testCases.loading && <Loading what="test cases" />}
      {testCases.error && <ErrorState message={testCases.error} onRetry={testCases.reload} />}

      {!testCases.loading && !testCases.error && (testCases.data?.items.length ?? 0) === 0 && (
        <EmptyState title="No test cases match">
          <p>Test cases are created by the worker after a push to a watched branch.</p>
        </EmptyState>
      )}

      <ul className="cases">
        {(testCases.data?.items ?? []).map((tc) => {
          const current = overrides[tc.id] ?? tc.status;
          return (
            <li key={tc.id} className={`case case--${current}`}>
              <div className="case__head">
                <h3>{tc.title}</h3>
                <div className="case__status">
                  {TEST_CASE_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={saving === tc.id}
                      className={`pill${current === s ? ' pill--active' : ''}`}
                      onClick={() => changeStatus(tc, s)}
                    >
                      {TEST_CASE_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="case__tags">
                <span className="tag">{tc.repoFullName}</span>
                <span className="tag">
                  <code>{tc.commitSha.slice(0, 7)}</code>
                </span>
                <span className="tag">{tc.priority} priority</span>
                <span className="tag">{tc.kind}</span>
                {tc.area && <span className="tag">{tc.area}</span>}
                <span className="tag tag--muted">{new Date(tc.createdAt).toLocaleString()}</span>
              </div>

              {tc.steps.length > 0 && (
                <ol className="case__steps">
                  {tc.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}

              <p className="case__expected">
                <strong>Expected:</strong> {tc.expectedResult}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
