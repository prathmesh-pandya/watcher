import type { ReactNode } from 'react';

/**
 * Renders `backtick` spans from model-written prose as real inline code.
 *
 * The generated steps routinely reference identifiers and CSS values, and
 * showing raw backticks is the same defect as showing raw markdown. Mono is
 * reserved for things that genuinely are data, which these are.
 */
export function RichText({ children }: { children: string }) {
  const parts = children.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i): ReactNode => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return <code key={i}>{part.slice(1, -1)}</code>;
        }
        return part;
      })}
    </>
  );
}
