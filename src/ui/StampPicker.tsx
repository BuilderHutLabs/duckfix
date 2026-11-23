import { useEffect, useMemo, useState } from 'react';
import { storageKey } from '../config';
import type { StampPreset } from '../model/document';
import { DATED, STAMP_INKS, STAMP_KINDS, fromIsoDay, isoDay, stampLines, type StampInk, type StampKind } from '../edit/stamps';
import { stampImage } from '../edit/stampImage';
import type { StoredSignature } from '../signature/storage';
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
  /** A ready-made stamp, or 'own' (a photo of the user's stamp). */
  kind: StampKind | 'own';
  src: string;
  aspect: number;
  /** Ready-made stamps: what they say (the date can be changed later). */
  preset?: StampPreset;
}

/** The date field of the stamp sheets ("Data"). */
export function StampDateField({ value, onChange }: { value: string; onChange(v: string): void }) {
  return (
    <label className="stamp-date">
      <span>{strings.stampDate}</span>
      <input type="date" value={value} required onChange={(e) => e.target.value && onChange(e.target.value)} />
    </label>
  );
}

/**
 * "Pieczątki": the user's own stamps (photos) and ready-made office stamps with a date (today, or
 * another). A tap puts one on the page (or on every page); red or blue ink is remembered.
 */
export function StampPicker({
  pages,
  own,
  onPick,
  onAddOwn,
  onRemoveOwn,
  onClose,
}: {
  /** Pages of the document ("Na wszystkie strony" from 2). */
  pages: number;
  own: StoredSignature[];
  onPick(stamp: PickedStamp, allPages: boolean): void;
  onAddOwn(): void;
  onRemoveOwn(id: string): void;
  onClose(): void;
}) {
  const [ink, setInk] = useState(loadInk);
  const [all, setAll] = useState(false);
  const [date, setDate] = useState(() => isoDay(new Date()));
  const backdrop = useBackdropClose(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const day = fromIsoDay(date) ?? new Date();
  const images = useMemo(() => {
    const d = fromIsoDay(date) ?? new Date();
    return STAMP_KINDS.map((kind) => {
      try {
        return { kind, ...stampImage(kind, ink, d) };
      } catch {
        return { kind, src: '', aspect: 2 };
      }
    });
  }, [ink, date]);

  const chooseInk = (v: StampInk) => {
    setInk(v);
    try {
      localStorage.setItem(INK_KEY, v);
    } catch {
      /* private mode */
    }
  };
  const label = (kind: StampKind) =>
    stampLines(kind, day)
      .map((l) => l.text.split('\n')[0].replace(/^\.+$/, ''))
      .filter(Boolean)
      .join(' ');

  return (
    <div className="sheet-backdrop" {...backdrop}>
      <div className="sheet stamp-sheet" role="dialog" aria-modal="true" aria-label={strings.stampTitle}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.stampTitle}</h2>
        {own.length > 0 && (
          <div className="stamp-own" role="group" aria-label={strings.stampOwn}>
            <p className="stamp-section">{strings.stampOwn}</p>
            <div className="stamp-own-row">
              {own.map((s) => (
                <div key={s.id} className="stamp-own-tile">
                  <button
                    type="button"
                    className="stamp-pick"
                    aria-label={strings.stampOwnLabel}
                    onClick={() => onPick({ kind: 'own', src: s.src, aspect: s.aspect }, all)}
                  >
                    <img src={s.src} alt="" />
                  </button>
                  <button
                    type="button"
                    className="sig-remove"
                    aria-label={strings.signatureRemove}
                    title={strings.signatureRemove}
                    onClick={() => window.confirm(strings.stampOwnRemoveConfirm) && onRemoveOwn(s.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="stamp-controls">
          <div className="stamp-inks" role="group">
            {STAMP_INKS.map((v) => (
              <button key={v} type="button" aria-pressed={ink === v} className={`stamp-ink ${v}`} onClick={() => chooseInk(v)}>
                <span className="stamp-ink-dot" aria-hidden="true" />
                {v === 'red' ? strings.stampInkRed : strings.stampInkBlue}
              </button>
            ))}
          </div>
          <StampDateField value={date} onChange={setDate} />
        </div>
        <div className="stamp-grid">
          {images.map((s) => (
            <button
              key={s.kind}
              type="button"
              className="stamp-pick"
              aria-label={label(s.kind)}
              disabled={!s.src}
              onClick={() =>
                onPick(
                  {
                    kind: s.kind,
                    src: s.src,
                    aspect: s.aspect,
                    preset: { kind: s.kind, ink, date },
                  },
                  all,
                )
              }
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
        <button type="button" className="btn stamp-own-add" onClick={onAddOwn}>
          {strings.stampOwnAdd}
        </button>
      </div>
    </div>
  );
}

/** "Data na pieczątce": a new date for a placed ready-made stamp. */
export function StampDateSheet({ initial, onApply, onClose }: { initial: string; onApply(date: string): void; onClose(): void }) {
  const [date, setDate] = useState(initial);
  const backdrop = useBackdropClose(onClose);
  return (
    <div className="sheet-backdrop" {...backdrop}>
      <div className="sheet stamp-date-sheet" role="dialog" aria-modal="true" aria-label={strings.stampDateTitle}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.stampDateTitle}</h2>
        <StampDateField value={date} onChange={setDate} />
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            {strings.cancel}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onApply(date)}>
            {strings.stampDateApply}
          </button>
        </div>
      </div>
    </div>
  );
}

export const isDated = (p?: StampPreset) => !!p && DATED.includes(p.kind);
