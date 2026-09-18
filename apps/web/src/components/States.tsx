import type { ReactNode } from 'react';

export function Loading({ what }: { what: string }) {
  return <p className="state state--muted">Loading {what}…</p>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state--error">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state--empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
