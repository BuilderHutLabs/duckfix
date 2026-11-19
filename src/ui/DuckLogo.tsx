import { useEffect, useState } from 'react';
import { strings } from './strings';

/** How long one quack (two beak claps + the bubble) lasts; matches the CSS animations. */
export const QUACK_MS = 2600;

/**
 * The app icon drawn as SVG (same shapes as scripts/make-icons.mjs) so the beak can move.
 * The lower half of the beak opens twice and a "Kwa kwa!" bubble pops out. Tap to quack again.
 */
export function DuckLogo({ autoplay }: { autoplay: boolean }) {
  // `round` changes on every quack so the CSS animations restart from the beginning
  const [round, setRound] = useState(autoplay ? 1 : 0);
  const quacking = round > 0;

  useEffect(() => {
    if (!quacking) return;
    const t = setTimeout(() => setRound(0), QUACK_MS);
    return () => clearTimeout(t);
  }, [round, quacking]);

  return (
    <div
      className={quacking ? 'duck quacking' : 'duck'}
      key={round}
      aria-hidden="true"
      onClick={() => setRound((r) => r + 1)}
    >
      <svg className="duck-svg" viewBox="0 0 100 100" width="96" height="96">
        <rect width="100" height="100" rx="22" fill="#fff8e1" />
        <g transform="translate(50 50) scale(0.8) translate(-52.5 -52)">
          <path d="M24 56 L7 40 L14 66 Z" fill="#ffd60a" />
          <ellipse cx="46" cy="64" rx="33" ry="22" fill="#ffd60a" />
          <ellipse cx="68" cy="37" rx="19" ry="19" fill="#ffd60a" />
          {/* beak: two halves hinged near the head (x 78, y 42) */}
          <g transform="rotate(7 88 42)">
            <path className="duck-beak-lower" d="M77.5 42 A10.5 5.5 0 0 0 98.5 42 Z" fill="#e88a00" />
            <path className="duck-beak-upper" d="M77.5 42 A10.5 5.5 0 0 1 98.5 42 Z" fill="#ff9f0a" />
          </g>
          <ellipse cx="42" cy="65" rx="16" ry="10" transform="rotate(-14.3 42 65)" fill="#f2b900" />
          <circle cx="73" cy="32" r="3.4" fill="#1c1c1e" />
          <circle cx="74.1" cy="30.9" r="1.1" fill="#fff" />
        </g>
      </svg>
      {quacking && <span className="duck-bubble">{strings.quack}</span>}
    </div>
  );
}
