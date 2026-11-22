import { useEffect, useMemo, useState } from 'react';
import { storageKey } from '../config';
import { STAMP_INKS, STAMP_KINDS, stampLines, type StampInk, type StampKind } from '../edit/stamps';
import { stampImage } from '../edit/stampImage';
import { useBackdropClose } from './backdrop';
import { strings } from './strings';

const INK_KEY = storageKey('duckfix-stamp-ink');

function loadInk(): StampInk {
  try {
    const v = localStorage.getItem(INK_KEY) as StampInk | null;
    return v && STAMP_INKS.includes(v) ? v : 'red';
  } catch {
    return 'red';
  }
}

export interface PickedStamp {
  kind: StampKind;
  src: string;
  aspect: number;
}

/**
 * "Pieczątki": ready-made office stamps with today's date. A tap puts one on the page (or on every
 * page); red or blue ink is remembered.
 */
export function StampPicker({
  pages,
  onPick,
  onClose,
}: {
  /** Pages of the document ("Na wszystkie strony" from 2). */
  pages: number;
  onPick(stamp: PickedStamp, allPages: boolean): void;
  onClose(): void;
}) {
  const [ink, setInk] = useState(loadInk);
  const [all, setAll] = useState(false);
  const backdrop = useBackdropClose(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const images = useMemo(() => {
    const day = new Date();
    return STAMP_KINDS.map((kind) => {
      try {
        return { kind, ...stampImage(kind, ink, day) };
      } catch {
        return { kind, src: '', aspect: 2 };
      }
    });
  }, [ink]);

  const chooseInk = (v: StampInk) => {
    setInk(v);
    try {
      localStorage.setItem(INK_KEY, v);
    } catch {
      /* private mode */
    }
  };

  return (
    <div className="sheet-backdrop" {...backdrop}>
      <div className="sheet stamp-sheet" role="dialog" aria-modal="true" aria-label={strings.stampTitle}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.stampTitle}</h2>
        <div className="segmented stamp-inks" role="group">
          {STAMP_INKS.map((v) => (
            <button key={v} type="button" aria-pressed={ink === v} className={`stamp-ink ${v}`} onClick={() => chooseInk(v)}>
              <span className="stamp-ink-dot" aria-hidden="true" />
              {v === 'red' ? strings.stampInkRed : strings.stampInkBlue}
            </button>
          ))}
        </div>
        <div className="stamp-grid">
          {images.map((s) => (
            <button
              key={s.kind}
              type="button"
              className="stamp-pick"
              aria-label={stampLines(s.kind)
                .map((l) => l.text.split('\n')[0].replace(/^\.+$/, ''))
                .filter(Boolean)
                .join(' ')}
              disabled={!s.src}
              onClick={() => onPick({ kind: s.kind, src: s.src, aspect: s.aspect }, all)}
            >
              {s.src && <img src={s.src} alt="" />}
            </button>
          ))}
        </div>
        {pages > 1 && (
          <label className="stamp-all">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            {strings.stampAllPages}
          </label>
        )}
      </div>
    </div>
  );
}
