import { useEffect, useRef } from 'react';
import { DuckArt } from './DuckLogo';

/** The duck rests in the middle, then flies to its place on the home screen while the backdrop fades. */
export const SPLASH_HOLD_MS = 600;
export const SPLASH_FLY_MS = 450;
export const SPLASH_TOTAL_MS = SPLASH_HOLD_MS + SPLASH_FLY_MS;
const SPLASH_SIZE = 128;

let launch: boolean | null = null;
/** True once per app start, and only in the installed app (opened from its icon), never in a browser tab. */
export function isStandaloneLaunch(): boolean {
  if (launch !== null) return launch;
  const standalone =
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && (navigator as { standalone?: boolean }).standalone === true);
  launch = standalone;
  return launch;
}

/**
 * Continues the system launch screen (same light background, duck in the middle) for about a second,
 * so opening the app feels like one smooth motion instead of a jump.
 */
export function Splash({ onDone }: { onDone(): void }) {
  const root = useRef<HTMLDivElement>(null);
  const duck = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    document.body.classList.add('splashing');
    const finish = () => {
      document.body.classList.remove('splashing');
      done.current();
    };
    const fly = setTimeout(() => {
      const el = duck.current;
      const target = document.querySelector('.home .duck');
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (el && target && typeof el.animate === 'function' && !reduced) {
        const from = el.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        const dx = to.left + to.width / 2 - (from.left + from.width / 2);
        const dy = to.top + to.height / 2 - (from.top + from.height / 2);
        // from the resting size, not the measured box (which includes the breathing scale)
        const scale = to.width / SPLASH_SIZE;
        const easing = 'cubic-bezier(0.4, 0, 0.2, 1)';
        el.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }], {
          duration: SPLASH_FLY_MS,
          easing,
          fill: 'forwards',
        });
      }
      root.current?.classList.add('leaving');
    }, SPLASH_HOLD_MS);
    const end = setTimeout(finish, SPLASH_TOTAL_MS);
    return () => {
      clearTimeout(fly);
      clearTimeout(end);
      document.body.classList.remove('splashing');
    };
  }, []);

  return (
    <div className="splash" ref={root} aria-hidden="true">
      <div className="splash-duck" ref={duck}>
        <DuckArt size={SPLASH_SIZE} />
      </div>
    </div>
  );
}
