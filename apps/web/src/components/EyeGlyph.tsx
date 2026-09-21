/**
 * The Watcher's eye, used as a status indicator rather than as a logo.
 *
 * The state is derived from data that actually exists: a repo with untriaged
 * test cases is something waiting on a person, so the iris lights gold and
 * breathes. Work already in progress shows violet, static. Everything triaged
 * leaves the eye dim and closed-off. This is the interface's only animation.
 */
export type EyeState = 'idle' | 'attention' | 'working';

export function EyeGlyph({ state = 'idle', size = 20 }: { state?: EyeState; size?: number }) {
  const label =
    state === 'attention' ? 'Waiting on review' : state === 'working' ? 'Review in progress' : 'Nothing pending';

  return (
    <svg
      className="eye"
      data-state={state}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {/* Sits behind the iris; only rendered in the attention state. */}
      <circle className="eye__glow" cx="12" cy="12" r="4.6" />
      <path className="eye__lens" d="M1.6 12C5.4 6.2 8.6 4.4 12 4.4s6.6 1.8 10.4 7.6c-3.8 5.8-7 7.6-10.4 7.6S5.4 17.8 1.6 12Z" />
      <circle className="eye__iris" cx="12" cy="12" r="3.5" />
      <circle className="eye__pupil" cx="12" cy="12" r="1.35" />
    </svg>
  );
}
