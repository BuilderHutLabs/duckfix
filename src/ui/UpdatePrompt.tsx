import { useRegisterSW } from 'virtual:pwa-register/react';
import { strings } from './strings';

/** Minimum time between service-worker update checks triggered by returning to the app. */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * An installed PWA on iPad is resumed rather than reloaded, so the browser rarely re-checks the
 * service worker: check for a new version whenever the app becomes visible again (throttled).
 * Returns a function that stops listening.
 */
export function checkForUpdatesOnResume(registration: ServiceWorkerRegistration): () => void {
  let lastCheck = Date.now(); // registering just checked
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheck = now;
    void registration.update().catch(() => {}); // offline: try again on a later resume
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => document.removeEventListener('visibilitychange', onVisibility);
}

/** Shown when a new service worker is waiting; the user decides when to reload (no surprise mid-work refresh). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) checkForUpdatesOnResume(registration);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="update-prompt" role="status">
      <span>{strings.updateAvailable}</span>
      <button type="button" className="btn btn-plain" onClick={() => void updateServiceWorker(true)}>
        {strings.updateAction}
      </button>
    </div>
  );
}
