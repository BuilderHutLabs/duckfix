import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DuckLogo } from './DuckLogo';
import { SPLASH_TOTAL_MS, isStandaloneLaunch } from './Splash';
import { useAppStore } from './store';
import { strings } from './strings';
import { Settings } from './Toolbar';
import { useSecretTaps } from './Diagnostics';
import { isSinglePhoto, openCamera } from './camera';
import { DuckTour } from './DuckTour';
import { DocsSheet } from './DocsSheet';
import { IconCamera } from './icons';

export const FILE_ACCEPT = 'application/pdf,image/*';

let introPlayed = false;
/** The panel comes up when the "Kwa kwa!" bubble is out (the quack starts the bubble at ~0.4 s). */
const PANEL_AFTER_QUACK_MS = 1300;

const IconFolder = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);
const IconShield = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

/** One big row of the home panel: icon, name, a short hint under it, an arrow. */
function HomeAction({
  id,
  icon,
  label,
  hint,
  primary = false,
  disabled = false,
  onClick,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  hint: string;
  primary?: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className={primary ? 'home-action primary' : 'home-action'}
      aria-label={label}
      aria-describedby={`home-${id}-hint`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="home-action-icon">{icon}</span>
      <span className="home-action-text">
        <span className="home-action-label">{label}</span>
        <span className="home-action-hint" id={`home-${id}-hint`}>
          {hint}
        </span>
      </span>
      <span className="home-action-arrow" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

/** How far the panel can be pulled (px) and how much it gives (harder and harder). */
const PULL_MAX = 120;
const pullOf = (dy: number) => PULL_MAX * (1 - Math.exp(-dy / 220));

/**
 * The panel can be pulled down with a finger, ever harder, and springs back when let go (just for
 * the feel of it). A pull that starts on a button does not press it.
 */
function useSpringPull(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { y: number; x: number } | null = null;
    let pulling = false;
    const set = (v: number | null) => {
      if (v === null) el.style.removeProperty('--pull');
      else el.style.setProperty('--pull', `${v.toFixed(1)}px`);
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = t ? { y: t.clientY, x: t.clientX } : null;
      pulling = false;
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t) return;
      const dy = t.clientY - start.y;
      const dx = t.clientX - start.x;
      if (!pulling) {
        if (dy <= 8 || Math.abs(dx) > dy) {
          if (dy < -8 || Math.abs(dx) > 8) start = null; // up or sideways: not a pull
          return;
        }
        pulling = true;
        el.classList.add('pulling');
      }
      e.preventDefault();
      set(pullOf(dy));
    };
    const onEnd = () => {
      start = null;
      if (!pulling) return;
      pulling = false;
      el.classList.remove('pulling');
      set(null); // back up with a little bounce (CSS)
      // the click that follows the finger must not press a button
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      el.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 400);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref]);
}

export function Home() {
  const { open, setScanPhoto, busy, openDiagnostics, library, docsOpen, openDocs } = useAppStore();
  const input = useRef<HTMLInputElement>(null);
  const onTitleTap = useSecretTaps(openDiagnostics);
  // the duck quacks once per app start, not every time the user comes back to the home screen
  // (marked after mount, so a double render in development does not use it up)
  const [intro] = useState(() => !introPlayed);
  useEffect(() => {
    introPlayed = true;
  }, []);

  // the panel slides up from the bottom once the duck has said "Kwa kwa!" (first start), else at once
  const panelDelay = intro ? (isStandaloneLaunch() ? SPLASH_TOTAL_MS : 0) + PANEL_AFTER_QUACK_MS : 80;
  const pickFiles = () => input.current?.click();
  const panel = useRef<HTMLElement>(null);
  useSpringPull(panel);

  return (
    <main className="home">
      {/* slowly drifting colour blobs (the chosen colour set) behind the content */}
      <div className="home-glow" aria-hidden="true">
        <span className="glow glow-1" />
        <span className="glow glow-2" />
        <span className="glow glow-3" />
        <span className="glow glow-4" />
      </div>
      <div className="home-top">
        {library.length > 0 && (
          <button type="button" className="home-docs" onClick={openDocs}>
            <IconFolder />
            {strings.docsShort(library.length)}
          </button>
        )}
        <Settings />
      </div>
      <div className="home-hero">
        {/* 5 taps on the title open the diagnostics screen */}
        <DuckLogo autoplay={intro} delayMs={isStandaloneLaunch() ? SPLASH_TOTAL_MS : 0} />
        <h1 className="home-title" onClick={onTitleTap}>
          {strings.appName}
        </h1>
        <p className="home-subtitle">{strings.homeTagline}</p>
      </div>
      <section ref={panel} className="home-panel" style={{ animationDelay: `${panelDelay}ms` }}>
        <span className="home-panel-grip" aria-hidden="true" />
        <HomeAction
          id="scan"
          primary
          icon={<IconCamera size={22} />}
          label={strings.homeScan}
          hint={strings.homeScanHint}
          disabled={busy === 'opening'}
          onClick={openCamera}
        />
        <HomeAction
          id="open"
          icon={<IconFolder />}
          label={busy === 'opening' ? strings.opening : strings.homeOpen}
          hint={strings.mergeHint}
          disabled={busy === 'opening'}
          onClick={pickFiles}
        />
        <div className="home-privacy">
          <span className="home-privacy-icon">
            <IconShield />
          </span>
          <span className="home-privacy-text">
            <strong>{strings.privacyTitle}</strong>
            <span>{strings.privacyNote}</span>
          </span>
        </div>
      </section>
      {docsOpen && <DocsSheet />}
      <DuckTour delayed={isStandaloneLaunch()} />
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        multiple
        accept={FILE_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = ''; // allow picking the same file again
          if (isSinglePhoto(files)) setScanPhoto(files[0]);
          else void open(files);
        }}
      />
    </main>
  );
}
