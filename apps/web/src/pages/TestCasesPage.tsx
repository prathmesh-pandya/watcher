import { useMemo, useState } from 'react';
import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUSES,
  type TestCase,
  type TestCasePriority,
  type TestCaseStatus,
} from '@watcher/shared';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { ErrorState, Loading } from '../components/States.js';
import { RichText } from '../components/RichText.js';

const COLUMN_LABELS: Record<TestCaseStatus, string> = {
  new: 'Not started',
  in_progress: 'Working on it',
  done: 'Done',
};

/** The verb on the button, not the name of the stored state. */
const MOVE_LABELS: Record<TestCaseStatus, string> = {
  new: 'Not started',
  in_progress: 'Working on it',
  done: 'Mark done',
};

/** High first, so the most urgent open work sits at the top of each column. */
const PRIORITY_RANK: Record<TestCasePriority, number> = { high: 0, medium: 1, low: 2 };

export function TestCasesPage() {
  const [repo, setRepo] = useState('');
  const [priority, setPriority] = useState<TestCasePriority | ''>('');
  const [openId, setOpenId] = useState<string | null>(null);

  const repos = useApi(() => api.listRepos(), []);
  // Status is the board's structure now, so the whole set is fetched once and
  // split into columns on the client — moving a card is then instant.
  const testCases = useApi(() => api.listTestCases({ repo: repo || undefined }), [repo]);

  const [overrides, setOverrides] = useState<Record<string, TestCaseStatus>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const statusOf = (tc: TestCase): TestCaseStatus => overrides[tc.id] ?? tc.status;

  async function move(tc: TestCase, next: TestCaseStatus) {
    if (statusOf(tc) === next) return;
    const previous = statusOf(tc);
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

  const columns = useMemo(() => {
    const all = (testCases.data?.items ?? []).filter((tc) => !priority || tc.priority === priority);
    const byStatus = {} as Record<TestCaseStatus, TestCase[]>;
    for (const status of TEST_CASE_STATUSES) {
      byStatus[status] = all
        .filter((tc) => (overrides[tc.id] ?? tc.status) === status)
        .sort(
          (a, b) =>
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            Date.parse(b.createdAt) - Date.parse(a.createdAt),
        );
    }
    return byStatus;
  }, [testCases.data, overrides, priority]);

  return (
    <div>
      <div className="head">
        <h1>Test Cases</h1>
        <p>What to check by hand for each change the Watcher has seen. Open a card to read its steps.</p>
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
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as TestCasePriority | '')}>
            <option value="">Any priority</option>
            {TEST_CASE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0]?.toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="btn" onClick={testCases.reload}>
          Refresh
        </button>
      </div>

      {failed && (
        <p className="feedback feedback--bad" style={{ marginBottom: 16 }}>
          Could not move that card. {failed}
        </p>
      )}

      {testCases.loading && <Loading what="the checklist" />}
      {testCases.error && <ErrorState message={testCases.error} onRetry={testCases.reload} />}

      {!testCases.loading && !testCases.error && (
        <div className="board">
          {TEST_CASE_STATUSES.map((status) => (
            <section className="column" data-status={status} key={status}>
              <header className="column__head">
                <span className="column__dot" />
                <span className="column__title">{COLUMN_LABELS[status]}</span>
                <span className="column__count">{columns[status].length}</span>
              </header>

              <div className="column__body">
                {columns[status].length === 0 && (
                  <p className="column__empty">
                    {status === 'new' ? 'Nothing waiting.' : status === 'in_progress' ? 'Nothing in hand.' : 'Nothing closed yet.'}
                  </p>
                )}

                {columns[status].map((tc) => {
                  const open = openId === tc.id;
                  return (
                    <article
                      key={tc.id}
                      className={`tcard${open ? ' tcard--open' : ''}${status === 'done' ? ' tcard--done' : ''}`}
                    >
                      <button
                        type="button"
                        className="tcard__summary"
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : tc.id)}
                      >
                        <h3 className="tcard__title">{tc.title}</h3>
                        <div className="tcard__tags">
                          <span className={`chip chip--${tc.priority}`}>{tc.priority}</span>
                          {tc.area && <span className="tcard__area">{tc.area}</span>}
                          <span className="tcard__repo">{tc.repoFullName.split('/')[1] ?? tc.repoFullName}</span>
                          <span className="tcard__sha">{tc.commitSha.slice(0, 7)}</span>
                        </div>
                      </button>

                      {open && (
                        <div className="tcard__detail">
                          {tc.steps.length > 0 && (
                            <ol className="tcard__steps">
                              {tc.steps.map((step, i) => (
                                <li key={i}>
                                  <RichText>{step}</RichText>
                                </li>
                              ))}
                            </ol>
                          )}

                          <p className="tcard__expected">
                            <b>What should happen:</b> <RichText>{tc.expectedResult}</RichText>
                          </p>

                          <p className="tcard__move">Move to</p>
                          <div className="statuses" role="group" aria-label="Move this test case">
                            {TEST_CASE_STATUSES.map((s) => (
                              <button
                                key={s}
                                type="button"
                                data-status={s}
                                aria-pressed={status === s}
                                disabled={saving === tc.id}
                                onClick={() => move(tc, s)}
                              >
                                {MOVE_LABELS[s]}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
