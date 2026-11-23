import { Splash, isStandaloneLaunch } from './Splash';
import { chromeIntentUrl, detectInAppBrowser } from './inAppBrowser';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n';
import { AppStoreProvider, createAppStore, useAppStore, type AppStore } from './store';
import { Home } from './Home';
import { Toolbar } from './Toolbar';
import { ActionBar } from './ActionBar';
import { SaveSheet } from './SaveSheet';
import { FilterSheet } from './FilterSheet';
import { ScanCrop } from './ScanCrop';
import { CameraInput, openCamera } from './camera';
import { useIncomingFiles } from '../share/incoming';
import { Progress } from './Progress';
import { ReviewGrid } from './ReviewGrid';
import { Diagnostics, DIAG_HASH } from './Diagnostics';
import { UpdatePrompt } from './UpdatePrompt';
import { strings } from './strings';
import { useBackLayer } from './backStack';
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

  useIncomingFiles(s);
  const [splash, setSplash] = useState(isStandaloneLaunch);
  const [lang] = useLanguage();

  return (
    <AppStoreProvider store={s}>
      {/* a language change re-renders the whole tree with the new texts */}
      <Fragment key={lang}>
        <Shell />
        <CameraInput />
        <ScanHost />
        <ShortcutHost />
        <UpdatePrompt />
      </Fragment>
      {splash && <Splash onDone={() => setSplash(false)} />}
    </AppStoreProvider>
  );
}

/**
 * Shortcuts on the app icon (manifest "shortcuts"): ?go=scan opens the camera, ?go=last the last
 * document. The address is tidied at once, so a refresh does not do it again.
 */
function ShortcutHost() {
  const { restorable, restore, phase } = useAppStore();
  const [go] = useState(() => new URLSearchParams(window.location.search).get('go'));
  const done = useRef(false);

  useEffect(() => {
    if (!go) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('go');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (go === 'scan' && !done.current) {
      done.current = true;
      openCamera();
    }
  }, [go]);

  // the stored document is found a moment after start
  useEffect(() => {
    if (go === 'last' && restorable && phase === 'home' && !done.current) {
      done.current = true;
      void restore();
    }
  }, [go, restorable, phase, restore]);
  return null;
}

function Shell() {
  const { phase, diagnostics, openDiagnostics, closeDiagnostics, flushSession, goHome } = useAppStore();
  // the phone's Back from a document: to the home screen (the document stays in "Moje dokumenty")
  useBackLayer(phase !== 'home' && !diagnostics, goHome);

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
          <FilterSheetHost />
        </div>
      )}
    </>
  );
}

function ScanHost() {
  const { scanPhoto } = useAppStore();
  return scanPhoto ? <ScanCrop key={`${scanPhoto.name}-${scanPhoto.lastModified}-${scanPhoto.size}`} file={scanPhoto} /> : null;
}

function FilterSheetHost() {
  const { filterSheetIds } = useAppStore();
  return filterSheetIds ? <FilterSheet ids={filterSheetIds} /> : null;
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
  const platform = detectInAppBrowser(typeof navigator === 'undefined' ? '' : (navigator.userAgent ?? ''));
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
