import { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { strings } from './strings';

function Switch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <label className="sheet-option">
      <span className="sheet-option-text">
        <span className="sheet-option-label">{label}</span>
        <span className="sheet-option-hint">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className="switch"
        onClick={() => onChange(!on)}
      />
    </label>
  );
}

/** Bottom sheet opened by "Zapisz PDF": smaller file / searchable text, then save. */
export function SaveSheet() {
  const s = useAppStore();
  const [opts, setOpts] = useState(s.exportOptions);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && s.closeSaveSheet();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);

  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && s.closeSaveSheet()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.saveOptions}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.saveOptions}</h2>
        <Switch
          label={strings.smallerFile}
          hint={strings.smallerFileHint}
          on={opts.compress}
          onChange={(compress) => setOpts((o) => ({ ...o, compress }))}
        />
        <Switch
          label={strings.searchableText}
          hint={strings.searchableTextHint}
          on={opts.ocr}
          onChange={(ocr) => setOpts((o) => ({ ...o, ocr }))}
        />
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => s.closeSaveSheet()}>
            {strings.cancel}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void s.export(opts)}>
            {strings.saveConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
