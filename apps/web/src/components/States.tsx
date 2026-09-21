import type { ReactNode } from 'react';

export function Loading({ what }: { what: string }) {
  return <p className="waiting">Loading {what}…</p>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state--error">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--quiet" style={{ marginTop: 12 }} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** An invitation to act, in plain language. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel state">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
