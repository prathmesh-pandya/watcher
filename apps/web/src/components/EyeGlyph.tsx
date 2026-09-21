/**
 * The Watcher's mark. Used once, in the nav bar — deliberately not repeated
 * as a status indicator or decoration elsewhere in the interface.
 */
export function EyeGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg className="eye" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Watcher">
      <path
        className="eye__lens"
        d="M1.6 12C5.4 6.2 8.6 4.4 12 4.4s6.6 1.8 10.4 7.6c-3.8 5.8-7 7.6-10.4 7.6S5.4 17.8 1.6 12Z"
      />
      <circle className="eye__iris" cx="12" cy="12" r="3.5" />
      <circle className="eye__pupil" cx="12" cy="12" r="1.35" />
    </svg>
  );
}
