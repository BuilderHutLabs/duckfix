import { useBackdropClose } from './backdrop';
import { useEffect, useState } from 'react';
import { parsePageRange } from '../model/pageRange';
import { useAppStore } from './store';
import { strings } from './strings';

function Switch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <label className="sheet-option">
      <span className="sheet-option-text">
        <span className="sheet-option-label">{label}</span>
        <span className="sheet-option-hint">{hint}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={() => onChange(!on)} />
    </label>
  );
}

/** Bottom sheet opened by "Zapisz PDF": smaller file / searchable text, then save. */
export function SaveSheet() {
  const backdrop = useBackdropClose(() => s.closeSaveSheet());
  const s = useAppStore();
  const [opts, setOpts] = useState(s.exportOptions);
  const [name, setName] = useState(() => s.defaultFileName());
  const ids = s.saveSheetIds;
  const all = s.doc.pages;
  // "Strony" (whole document only; in select mode the chosen pages are saved)
  const [range, setRange] = useState('');
  const picked = ids ? null : parsePageRange(range, all.length);
  const rangeBad = !ids && picked === null;
  const count = ids ? ids.length : (picked?.length ?? all.length);
  const [split, setSplit] = useState(false);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const pdf = opts.format === 'pdf';
  const blocked = rangeBad || (pdf && locked && !password);

  const go = (send: boolean) => {
    if (blocked) return;
    const chosen = ids ?? (range.trim() && picked ? picked.map((i) => all[i].id) : null);
    void s.export(opts, {
      name,
      ids: chosen,
      split: pdf && split,
      password: pdf && locked ? password : undefined,
      send,
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && s.closeSaveSheet();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s]);

  return (
    <div className="sheet-backdrop" {...backdrop}>
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
        {!ids && all.length > 1 && (
          <label className="sheet-field">
            <span className="sheet-option-hint">{strings.pagesField}</span>
            <input
              type="text"
              className="sheet-input"
              aria-label={strings.pagesField}
              aria-invalid={rangeBad}
              placeholder={strings.pagesPlaceholder}
              value={range}
              onChange={(e) => setRange(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
            />
            {rangeBad && <span className="sheet-error">{strings.pagesInvalid(all.length)}</span>}
          </label>
        )}
        {pdf && (
          <Switch
            label={strings.searchableText}
            hint={strings.searchableTextHint}
            on={opts.ocr}
            onChange={(ocr) => setOpts((o) => ({ ...o, ocr }))}
          />
        )}
        {pdf && count > 1 && <Switch label={strings.splitPages} hint={strings.splitPagesHint} on={split} onChange={setSplit} />}
        {pdf && <Switch label={strings.passwordSwitch} hint={strings.passwordSwitchHint} on={locked} onChange={setLocked} />}
        {pdf && locked && (
          <span className="sheet-name sheet-password">
            <input
              type={showPassword ? 'text' : 'password'}
              aria-label={strings.passwordField}
              placeholder={strings.passwordField}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              enterKeyHint="done"
              autoFocus
            />
            <button
              type="button"
              className="sheet-eye"
              aria-label={showPassword ? strings.passwordHide : strings.passwordShow}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </span>
        )}
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => s.closeSaveSheet()}>
            {strings.cancel}
          </button>
          {s.canShareFiles && (
            <button type="button" className="btn" disabled={blocked} onClick={() => go(true)}>
              {strings.sendConfirm}
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={blocked} onClick={() => go(false)}>
            {strings.saveConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
