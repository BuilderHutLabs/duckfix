import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DuckLogo } from './DuckLogo';
import { SPLASH_TOTAL_MS, isStandaloneLaunch } from './Splash';
import { useAppStore } from './store';
import { strings } from './strings';
import { Settings } from './Toolbar';
import { useSecretTaps } from './Diagnostics';
import { isSinglePhoto, openCamera } from './camera';
import { DuckTour } from './DuckTour';
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
const IconHistory = () => (
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
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
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

export function Home() {
  const { open, setScanPhoto, busy, restorable, restore, discardStored, openDiagnostics } = useAppStore();
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
      <section className="home-panel" style={{ animationDelay: `${panelDelay}ms` }}>
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
        {restorable && (
          <>
            <HomeAction
              id="restore"
              icon={<IconHistory />}
              label={strings.restoreSession}
              hint={strings.homeRestoreHint}
              onClick={restore}
            />
            <button type="button" className="btn btn-plain home-start-over" onClick={discardStored}>
              {strings.startOver}
            </button>
          </>
        )}
        <p className="home-privacy">
          <span aria-hidden="true">🔒</span>
          {strings.privacyNote}
        </p>
      </section>
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
