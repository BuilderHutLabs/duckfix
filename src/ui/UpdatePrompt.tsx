import { useRegisterSW } from 'virtual:pwa-register/react';
import { strings } from './strings';

/** Shown when a new service worker is waiting; the user decides when to reload (no surprise mid-work refresh). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update-prompt" role="status">
      <span>{strings.updateAvailable} — </span>
      <button type="button" className="btn" onClick={() => void updateServiceWorker(true)}>
        {strings.updateAction}
      </button>
    </div>
  );
}
