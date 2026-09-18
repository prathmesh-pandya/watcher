import { useMemo, useState } from 'react';
import type { FeatureDoc } from '@watcher/shared';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { EmptyState, ErrorState, Loading } from '../components/States.js';

export function FeaturesPage() {
  const { data, loading, error, reload } = useApi(() => api.listFeatureDocs(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const docs = useMemo(() => data?.items ?? [], [data]);
  const selected: FeatureDoc | undefined = docs.find((d) => d.id === selectedId) ?? docs[0];

  if (loading) return <Loading what="feature documentation" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  if (docs.length === 0) {
    return (
      <EmptyState title="No feature documentation yet">
        <p>
          Docs appear here after the first push to a watched branch. Register a repo on the Settings page, then push
          to its target branch.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="page">
      <div className="page__header">
        <h1>Features</h1>
        <p className="page__subtitle">
          Read-only technical docs, revised incrementally on every push. {docs.length} repo
          {docs.length === 1 ? '' : 's'} documented.
        </p>
      </div>

      {docs.length > 1 && (
        <div className="tabs">
          {docs.map((doc) => (
            <button
              key={doc.id}
              type="button"
              className={`tab${doc.id === selected?.id ? ' tab--active' : ''}`}
              onClick={() => setSelectedId(doc.id)}
            >
              {doc.repoFullName}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <article className="card">
          <header className="card__header">
            <h2>{selected.repoFullName}</h2>
            <dl className="meta">
              <div>
                <dt>Branch</dt>
                <dd>
                  <code>{selected.branch}</code>
                </dd>
              </div>
              <div>
                <dt>Last commit</dt>
                <dd>
                  <code>{selected.lastCommitSha?.slice(0, 7) ?? '—'}</code>
                </dd>
              </div>
              <div>
                <dt>Revisions</dt>
                <dd>{selected.revisionCount}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{new Date(selected.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          </header>

          {/*
            Rendered as preformatted text for now. Swap in a markdown renderer
            (react-markdown) once the LLM is actually producing the content.
          */}
          <pre className="doc">{selected.content || '(empty)'}</pre>

          {selected.history.length > 0 && (
            <details className="history">
              <summary>Edit history ({selected.history.length})</summary>
              <ul>
                {[...selected.history].reverse().map((rev, i) => (
                  <li key={`${rev.commitSha}-${i}`}>
                    <code>{rev.commitSha.slice(0, 7)}</code> — {rev.summary}{' '}
                    <span className="muted">({new Date(rev.createdAt).toLocaleString()})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </article>
      )}
    </div>
  );
}
