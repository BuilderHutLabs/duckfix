import { useState, useSyncExternalStore } from 'react';
import { storageKey } from '../config';
import { DuckArt } from './DuckLogo';
import { strings } from './strings';

// v2: the tour now shows the camera, editing and signing, so everyone sees it once more
const TOUR_KEY = storageKey('duckfix-tour2');

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

/** Asked again from the settings ("Pokaż pomocnika"); a tiny store so the settings can open it. */
let again = 0;
const listeners = new Set<() => void>();
export function openTour(): void {
  again++;
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** A small moving picture for each tip: the camera, editing a page, signing it. */
const SCENES = ['camera', 'edit', 'sign'] as const;

function Scene({ kind }: { kind: (typeof SCENES)[number] }) {
  return (
    <svg className={`tour-scene tour-scene-${kind}`} viewBox="0 0 160 96" aria-hidden="true">
      {kind === 'camera' && (
        <>
          <rect className="ts-phone" x="52" y="4" width="56" height="88" rx="9" />
          <rect className="ts-screen" x="57" y="12" width="46" height="66" rx="3" />
          <g className="ts-sheet">
            <rect x="63" y="20" width="34" height="46" rx="2" />
            <line x1="68" y1="30" x2="92" y2="30" />
            <line x1="68" y1="37" x2="88" y2="37" />
            <line x1="68" y1="44" x2="91" y2="44" />
          </g>
          <path className="ts-corners" d="M60 24v-6h6 M100 24v-6h-6 M60 62v6h6 M100 62v6h-6" />
          <circle className="ts-shutter" cx="80" cy="85" r="4" />
          <rect className="ts-flash" x="57" y="12" width="46" height="66" rx="3" />
        </>
      )}
      {kind === 'edit' && (
        <>
          <rect className="ts-page" x="44" y="6" width="72" height="84" rx="4" />
          <line className="ts-line" x1="54" y1="22" x2="104" y2="22" />
          <rect className="ts-cover" x="54" y="34" width="40" height="8" rx="1" />
          <line className="ts-line" x1="54" y1="52" x2="98" y2="52" />
          <rect className="ts-hl" x="52" y="48" width="48" height="8" rx="2" />
          <path className="ts-tick" d="M56 70 l6 7 l13 -15" />
          <text className="ts-text" x="82" y="76">
            Aa
          </text>
        </>
      )}
      {kind === 'sign' && (
        <>
          <rect className="ts-page" x="44" y="6" width="72" height="84" rx="4" />
          <line className="ts-line" x1="54" y1="20" x2="104" y2="20" />
          <line className="ts-line" x1="54" y1="28" x2="96" y2="28" />
          <line className="ts-line" x1="54" y1="36" x2="100" y2="36" />
          <line className="ts-base" x1="58" y1="74" x2="104" y2="74" />
          <path className="ts-sig" d="M60 70 c4 -14 8 -14 7 -2 c-1 8 5 -12 9 -8 c3 3 -2 9 2 8 c4 -1 6 -10 10 -6 c2 2 0 6 4 5 l8 -3" />
        </>
      )}
    </svg>
  );
}

/** First start (and on request): the duck shows the camera, editing and signing in three short tips. */
export function DuckTour({ delayed = false }: { delayed?: boolean }) {
  const asked = useSyncExternalStore(subscribe, () => again);
  const [shownFor, setShownFor] = useState(() => (seen() ? again : -1));
  const [step, setStep] = useState(0);
  const open = shownFor !== asked;
  if (!open) return null;

  const close = () => {
    markSeen();
    setShownFor(asked);
    setStep(0);
  };
  const last = step === strings.tourSteps.length - 1;

  return (
    <div className={delayed ? 'tour tour-delayed' : 'tour'} role="dialog" aria-modal="true" aria-label={strings.tourTitle}>
      <div className="tour-card">
        <div className="tour-duck" aria-hidden="true">
          <DuckArt size={64} />
        </div>
        <div className="tour-bubble" key={step}>
          <Scene kind={SCENES[step] ?? 'camera'} />
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
