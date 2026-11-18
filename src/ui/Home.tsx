import { useRef } from 'react';
import { useAppStore } from './store';
import { strings } from './strings';
import { Settings } from './Toolbar';
import { useSecretTaps } from './Diagnostics';

export const FILE_ACCEPT = 'application/pdf,image/*';

export function Home() {
  const { open, busy, restorable, restore, discardStored, openDiagnostics } = useAppStore();
  const input = useRef<HTMLInputElement>(null);
  const onTitleTap = useSecretTaps(openDiagnostics);

  return (
    <main className="home">
      <div className="home-top">
        <Settings />
      </div>
      {/* 5 taps on the title open the diagnostics screen */}
      <h1 className="home-title" onClick={onTitleTap}>
        {strings.appName}
      </h1>
      <p className="home-subtitle">{strings.appDescription}</p>
      {restorable ? (
        <div className="home-restore">
          <button type="button" className="btn btn-primary btn-huge" onClick={restore}>
            {strings.restoreSession}
          </button>
          <button type="button" className="btn" onClick={discardStored}>
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
