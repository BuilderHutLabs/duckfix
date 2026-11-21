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
  const [name, setName] = useState(() => s.defaultFileName());
  const ids = s.saveSheetIds;

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
        {ids && <p className="sheet-sub">{strings.pageLookCount(ids.length)}</p>}
        <label className="sheet-field">
          <span className="sheet-option-hint">{strings.fileName}</span>
          <span className="sheet-name">
            <input
              type="text"
              aria-label={strings.fileName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              enterKeyHint="done"
            />
            <span className="sheet-ext" aria-hidden="true">
              .{opts.format}
            </span>
          </span>
        </label>
        <div className="segmented sheet-format" role="group" aria-label={strings.format}>
          {(['pdf', 'jpg'] as const).map((f) => (
            <button key={f} type="button" aria-pressed={opts.format === f} onClick={() => setOpts((o) => ({ ...o, format: f }))}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <Switch
          label={strings.smallerFile}
          hint={strings.smallerFileHint}
          on={opts.compress}
          onChange={(compress) => setOpts((o) => ({ ...o, compress }))}
        />
        {opts.format === 'pdf' && (
        <Switch
          label={strings.searchableText}
          hint={strings.searchableTextHint}
          on={opts.ocr}
          onChange={(ocr) => setOpts((o) => ({ ...o, ocr }))}
        />
        )}
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => s.closeSaveSheet()}>
            {strings.cancel}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void s.export(opts, { name, ids })}>
            {strings.saveConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
