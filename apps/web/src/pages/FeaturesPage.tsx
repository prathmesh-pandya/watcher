import { useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FeatureDoc } from '@watcher/shared';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { EmptyState, ErrorState, Loading } from '../components/States.js';

export function FeaturesPage() {
  const { data, loading, error, reload } = useApi(() => api.listFeatureDocs(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const docs = useMemo(() => data?.items ?? [], [data]);
  const selected: FeatureDoc | undefined = docs.find((d) => d.id === selectedId) ?? docs[0];

  if (loading) return <Loading what="the documentation" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  if (docs.length === 0) {
    return (
      <EmptyState title="Nothing observed yet">
        <p>
          The Watcher writes documentation the first time you push to a branch it follows. Add a repo to start
          watching.
        </p>
      </EmptyState>
    );
  }

  return (
    <div className="reading">
      <div className="head">
        <h1>Features</h1>
        <p>What the Watcher understands about the code it follows, revised with every push — never rewritten.</p>
      </div>

      {docs.length > 1 && (
        <div className="controls">
          <label>
            Repository
            <select value={selected?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
              {docs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.repoFullName}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {selected && (
        <>
          <section className="panel">
            <div className="panel__head">
              <h2>{selected.repoFullName}</h2>
            </div>

            <dl className="facts">
              <div>
                <dt>Branch</dt>
                <dd className="data">{selected.branch}</dd>
              </div>
              <div>
                <dt>Last commit read</dt>
                <dd className="data">{selected.lastCommitSha?.slice(0, 7) ?? 'none yet'}</dd>
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

            {/* The document the Watcher writes: parchment, void as its ink. */}
            <article className="manuscript">
              {selected.content.trim() ? (
                <div className="md">
                  <Markdown remarkPlugins={[remarkGfm]}>{selected.content}</Markdown>
                </div>
              ) : (
                <div className="md">
                  <p>This document is empty. It will be written on the next push to the watched branch.</p>
                </div>
              )}
            </article>
          </section>

          {selected.history.length > 0 && (
            <section className="panel">
              <div className="panel__head">
                <h2>Revision history</h2>
              </div>
              {/* Genuinely sequential data, so dated markers are earned here. */}
              <ol className="timeline">
                {[...selected.history].reverse().map((rev, i) => (
                  <li key={`${rev.commitSha}-${i}`}>
                    <div className="timeline__when">
                      <span className="data">{rev.commitSha.slice(0, 7)}</span>
                      <span className="timeline__date">{new Date(rev.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="timeline__what">{rev.summary}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
