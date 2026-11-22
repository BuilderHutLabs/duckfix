import { useBackdropClose } from './backdrop';
import { useEffect } from 'react';
import type { ScanFilter } from '../scan/enhance';
import { useAppStore } from './store';
import { strings } from './strings';

/** "Wygląd stron": Kolor / Wybielony / Czarno-biały for the chosen pages (old grey scans too). */
export function FilterSheet({ ids }: { ids: string[] }) {
  const backdrop = useBackdropClose(() => s.closeFilterSheet());
  const s = useAppStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && s.closeFilterSheet();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);
  const options: [ScanFilter, string, string][] = [
    ['whiten', strings.filterWhiten, strings.filterWhitenHint],
    ['bw', strings.filterBw, strings.filterBwHint],
    ['color', strings.filterColor, strings.filterColorHint],
  ];
  return (
    <div className="sheet-backdrop" {...backdrop}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.pageLook}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.pageLook}</h2>
        <p className="sheet-sub">{strings.pageLookCount(ids.length)}</p>
        {options.map(([f, label, hint]) => (
          <button key={f} type="button" className="sheet-choice" aria-label={label} onClick={() => s.setFilter(ids, f)}>
            <span className="sheet-option-label">{label}</span>
            <span className="sheet-option-hint">{hint}</span>
          </button>
        ))}
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => s.closeFilterSheet()}>
            {strings.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
