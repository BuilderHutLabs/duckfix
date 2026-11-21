import { useState } from 'react';
import { storageKey } from '../config';
import { DuckArt } from './DuckLogo';
import { strings } from './strings';

const TOUR_KEY = storageKey('duckfix-tour');

function seen(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === '1';
  } catch {
    return true; // no storage: do not nag on every start
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(TOUR_KEY, '1');
  } catch {
    /* private mode */
  }
}

/** First start only: the duck explains the app in three short speech bubbles. */
export function DuckTour({ delayed = false }: { delayed?: boolean }) {
  const [open, setOpen] = useState(() => !seen());
  const [step, setStep] = useState(0);
  if (!open) return null;

  const close = () => {
    markSeen();
    setOpen(false);
  };
  const last = step === strings.tourSteps.length - 1;

  return (
    <div className={delayed ? 'tour tour-delayed' : 'tour'} role="dialog" aria-modal="true" aria-label={strings.tourTitle}>
      <div className="tour-card">
        <div className="tour-duck" aria-hidden="true">
          <DuckArt size={64} />
        </div>
        <div className="tour-bubble" key={step}>
          <p>{strings.tourSteps[step]}</p>
          <div className="tour-dots" aria-hidden="true">
            {strings.tourSteps.map((_, i) => (
              <span key={i} className={i === step ? 'on' : ''} />
            ))}
          </div>
        </div>
        <div className="tour-actions">
          {!last && (
            <button type="button" className="btn btn-plain" onClick={close}>
              {strings.tourSkip}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? strings.tourDone : strings.tourNext}
          </button>
        </div>
      </div>
    </div>
  );
}
