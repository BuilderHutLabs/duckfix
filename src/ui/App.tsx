import { Splash, isStandaloneLaunch } from './Splash';
import { chromeIntentUrl, detectInAppBrowser } from './inAppBrowser';
import { Fragment, useEffect, useState } from 'react';
import { useLanguage } from '../i18n';
import { AppStoreProvider, createAppStore, useAppStore, type AppStore } from './store';
import { Home } from './Home';
import { Toolbar } from './Toolbar';
import { ActionBar } from './ActionBar';
import { SaveSheet } from './SaveSheet';
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

  const [splash, setSplash] = useState(isStandaloneLaunch);
  const [lang] = useLanguage();

  return (
    <AppStoreProvider store={s}>
      {/* a language change re-renders the whole tree with the new texts */}
      <Fragment key={lang}>
        <Shell />
        <UpdatePrompt />
      </Fragment>
      {splash && <Splash onDone={() => setSplash(false)} />}
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
          <InAppBanner />
          <ErrorBanner />
          <Home />
        </>
      ) : (
        <div className="review">
          {/* one sticky block: the error banner shows below the toolbar, never over it */}
          <div className="review-top">
            <Toolbar />
            <Progress />
            <InAppBanner />
            <ErrorBanner />
            <NoticeBanner />
          </div>
          <ReviewGrid />
          <ActionBar />
          <SaveSheetHost />
        </div>
      )}
    </>
  );
}

function SaveSheetHost() {
  const { saveSheetOpen } = useAppStore();
  return saveSheetOpen ? <SaveSheet /> : null;
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

function InAppBanner() {
  const platform = detectInAppBrowser(typeof navigator === 'undefined' ? '' : navigator.userAgent ?? '');
  if (!platform) return null;
  return (
    <div className="inapp-banner" role="alert">
      <div className="inapp-text">
        <p>{strings.inAppWarning}</p>
        {platform === 'ios' && <p>{strings.openInSafariHint}</p>}
      </div>
      {platform === 'android' && (
        <a className="btn btn-primary" href={chromeIntentUrl(window.location.href)}>
          {strings.openInChrome}
        </a>
      )}
    </div>
  );
}
