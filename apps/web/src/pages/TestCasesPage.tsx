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
import { RichText } from '../components/RichText.js';

/** The verb the person performs, not the state the system stores. */
const ACTION_LABELS: Record<TestCaseStatus, string> = {
  new: 'Not started',
  in_progress: 'Working on it',
  done: 'Mark done',
};

export function TestCasesPage() {
  const [repo, setRepo] = useState('');
  const [status, setStatus] = useState<TestCaseStatus | ''>('');

  const repos = useApi(() => api.listRepos(), []);
  const testCases = useApi(
    () => api.listTestCases({ repo: repo || undefined, status: status || undefined }),
    [repo, status],
  );

  const [overrides, setOverrides] = useState<Record<string, TestCaseStatus>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function changeStatus(tc: TestCase, next: TestCaseStatus) {
    const previous = overrides[tc.id] ?? tc.status;
    if (previous === next) return;

    setOverrides((o) => ({ ...o, [tc.id]: next }));
    setSaving(tc.id);
    setFailed(null);
    try {
      await api.setTestCaseStatus(tc.id, next);
    } catch (err) {
      setOverrides((o) => ({ ...o, [tc.id]: previous }));
      setFailed((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const items = testCases.data?.items ?? [];

  return (
    <div>
      <div className="head">
        <h1>Test Cases</h1>
        <p>What to check by hand for each change the Watcher has seen. Move each one along as you work through it.</p>
      </div>

      <div className="controls">
        <label>
          Repository
          <select value={repo} onChange={(e) => setRepo(e.target.value)}>
            <option value="">Every repository</option>
            {(repos.data?.items ?? []).map((r) => (
              <option key={r.id} value={r.fullName}>
                {r.fullName}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as TestCaseStatus | '')}>
            <option value="">Any status</option>
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

      {failed && <p className="feedback feedback--bad">Could not save that change. {failed}</p>}

      {testCases.loading && <Loading what="the checklist" />}
      {testCases.error && <ErrorState message={testCases.error} onRetry={testCases.reload} />}

      {!testCases.loading && !testCases.error && items.length === 0 && (
        <EmptyState title={repo || status ? 'Nothing matches those filters' : 'No test cases yet'}>
          <p>
            {repo || status
              ? 'Widen the filters above, or wait for the next push to a watched branch.'
              : 'The Watcher writes these after a push to a branch it follows. Add a repo to start watching.'}
          </p>
        </EmptyState>
      )}

      <ul className="observations">
        {items.map((tc) => {
          const current = overrides[tc.id] ?? tc.status;
          return (
            <li key={tc.id} className={`panel observation${current === 'done' ? ' observation--done' : ''}`}>
              <div className="panel__head">
                <h3 className="observation__title">{tc.title}</h3>

                {/* One clearly filled control; the rest recede. */}
                <div className="statuses" role="group" aria-label="Status">
                  {TEST_CASE_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      data-status={s}
                      aria-pressed={current === s}
                      disabled={saving === tc.id}
                      onClick={() => changeStatus(tc, s)}
                    >
                      {ACTION_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="observation__meta">
                <span>{tc.repoFullName}</span>
                <span className="data">{tc.commitSha.slice(0, 7)}</span>
                <span>{tc.priority} priority</span>
                {tc.area && <span>{tc.area}</span>}
                <span>{new Date(tc.createdAt).toLocaleDateString()}</span>
              </div>

              {tc.steps.length > 0 && (
                <ol className="observation__steps">
                  {tc.steps.map((step, i) => (
                    <li key={i}>
                      <RichText>{step}</RichText>
                    </li>
                  ))}
                </ol>
              )}

              <p className="observation__expected">
                <b>What should happen:</b> <RichText>{tc.expectedResult}</RichText>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
