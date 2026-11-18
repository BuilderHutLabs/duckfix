import { useRef } from 'react';
import { useAppStore } from './store';
import { strings } from './strings';
import { Settings } from './Toolbar';

export const FILE_ACCEPT = 'application/pdf,image/*';

export function Home() {
  const { open, busy } = useAppStore();
  const input = useRef<HTMLInputElement>(null);

  return (
    <main className="home">
      <div className="home-top">
        <Settings />
      </div>
      <h1 className="home-title">{strings.appName}</h1>
      <p className="home-subtitle">{strings.appDescription}</p>
      <button
        type="button"
        className="btn btn-primary btn-huge"
        disabled={busy === 'opening'}
        onClick={() => input.current?.click()}
      >
        {busy === 'opening' ? strings.opening : strings.open}
      </button>
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
