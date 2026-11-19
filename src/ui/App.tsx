import { useEffect, useState } from 'react';
import { AppStoreProvider, createAppStore, useAppStore, type AppStore } from './store';
import { Home } from './Home';
import { Toolbar } from './Toolbar';
import { ActionBar } from './ActionBar';
import { Progress } from './Progress';
import { ReviewGrid } from './ReviewGrid';
import { Diagnostics, DIAG_HASH } from './Diagnostics';
import { UpdatePrompt } from './UpdatePrompt';
import { strings } from './strings';
import './app.css';

export function App({ store }: { store?: AppStore }) {
  const [s] = useState(() => store ?? createAppStore());

  // ask the browser not to evict IndexedDB (session + offline data) under storage pressure; best-effort
  useEffect(() => {
    try {
      void navigator.storage?.persist?.().catch(() => {});
    } catch {
      /* unsupported */
    }
  }, []);

  return (
    <AppStoreProvider store={s}>
      <Shell />
      <UpdatePrompt />
    </AppStoreProvider>
  );
}

function Shell() {
  const { phase, diagnostics, openDiagnostics, closeDiagnostics, flushSession } = useAppStore();

  // URL hash #diag opens the diagnostics screen (on load and when the hash changes)
  useEffect(() => {
    const check = () => {
      if (window.location.hash === DIAG_HASH) openDiagnostics();
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [openDiagnostics]);

  // iOS may kill a hidden tab without warning: write the pending session save right away
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') flushSession();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flushSession);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flushSession);
    };
  }, [flushSession]);

  if (diagnostics) {
    return (
      <Diagnostics
        onClose={() => {
          if (window.location.hash === DIAG_HASH) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
          }
          closeDiagnostics();
        }}
      />
    );
  }

  return (
    <>
      {phase === 'home' ? (
        <>
          <ErrorBanner />
          <Home />
        </>
      ) : (
        <div className="review">
          {/* one sticky block: the error banner shows below the toolbar, never over it */}
          <div className="review-top">
            <Toolbar />
            <Progress />
            <ErrorBanner />
            <NoticeBanner />
          </div>
          <ReviewGrid />
          <ActionBar />
        </div>
      )}
    </>
  );
}

function ErrorBanner() {
  const { error, dismissError } = useAppStore();
  if (!error) return null;
  return (
    <div className="error-banner" role="alert">
      <span>{error}</span>
      <button type="button" className="btn btn-plain" onClick={dismissError}>
        {strings.dismiss}
      </button>
    </div>
  );
}

function NoticeBanner() {
  const { notice, dismissNotice } = useAppStore();
  if (!notice) return null;
  return (
    <div className="notice-banner" role="status">
      <span>{notice}</span>
      <button type="button" className="btn btn-plain" onClick={dismissNotice}>
        {strings.dismiss}
      </button>
    </div>
  );
}
