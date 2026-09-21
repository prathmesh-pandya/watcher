import type { ReactNode } from 'react';
import { EyeGlyph } from './EyeGlyph.js';

/** Loading reads as the eye coming open, not a spinner. */
export function Loading({ what }: { what: string }) {
  return (
    <div className="waiting">
      <EyeGlyph state="working" size={22} />
      <span>Looking for {what}…</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel state--error">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--quiet" style={{ marginTop: 14 }} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

/** An invitation to act, in the interface's own voice. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel state">
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <EyeGlyph state="idle" size={30} />
      </div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
