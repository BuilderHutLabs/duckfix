import { useEffect, useRef, useState } from 'react';
import { DuckLogo } from './DuckLogo';
import { SPLASH_TOTAL_MS, isStandaloneLaunch } from './Splash';
import { useAppStore } from './store';
import { strings } from './strings';
import { Settings } from './Toolbar';
import { useSecretTaps } from './Diagnostics';
import { openCamera } from './camera';
import { IconCamera } from './icons';

export const FILE_ACCEPT = 'application/pdf,image/*';

let introPlayed = false;

export function Home() {
  const { open, busy, restorable, restore, discardStored, openDiagnostics } = useAppStore();
  const input = useRef<HTMLInputElement>(null);
  const onTitleTap = useSecretTaps(openDiagnostics);
  // the duck quacks once per app start, not every time the user comes back to the home screen
  // (marked after mount, so a double render in development does not use it up)
  const [intro] = useState(() => !introPlayed);
  useEffect(() => {
    introPlayed = true;
  }, []);

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
      {/* 5 taps on the title open the diagnostics screen */}
      <DuckLogo autoplay={intro} delayMs={isStandaloneLaunch() ? SPLASH_TOTAL_MS : 0} />
      <h1 className="home-title" onClick={onTitleTap}>
        {strings.appName}
      </h1>
      <p className="home-subtitle">{strings.appDescription}</p>
      {restorable ? (
        <div className="home-restore">
          <button type="button" className="btn btn-primary btn-huge" onClick={restore}>
            {strings.restoreSession}
          </button>
          <button type="button" className="btn btn-plain" onClick={discardStored}>
            {strings.startOver}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-huge"
          disabled={busy === 'opening'}
          onClick={() => input.current?.click()}
        >
          {busy === 'opening' ? strings.opening : strings.open}
        </button>
      )}
      {!restorable && (
        <button type="button" className="btn btn-camera" disabled={busy === 'opening'} onClick={openCamera}>
          <IconCamera size={20} />
          {strings.takePhoto}
        </button>
      )}
      <ul className="home-steps">
        {strings.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>
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
          void open(files);
        }}
      />
    </main>
  );
}
