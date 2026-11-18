import { useState } from 'react';
import { AppStoreProvider, createAppStore, useAppStore, type AppStore } from './store';
import { Home } from './Home';
import { Toolbar } from './Toolbar';
import { Progress } from './Progress';
import { ReviewGrid } from './ReviewGrid';
import { strings } from './strings';
import './app.css';

export function App({ store }: { store?: AppStore }) {
  const [s] = useState(() => store ?? createAppStore());
  return (
    <AppStoreProvider store={s}>
      <Shell />
    </AppStoreProvider>
  );
}

function Shell() {
  const { phase } = useAppStore();
  return (
    <>
      <ErrorBanner />
      {phase === 'home' ? (
        <Home />
      ) : (
        <div className="review">
          <Toolbar />
          <Progress />
          <ReviewGrid />
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
      <button type="button" className="btn" onClick={dismissError}>
        {strings.dismiss}
      </button>
    </div>
  );
}
