import { useState } from 'react';
import { isFlagged, useAppStore } from './store';
import { strings } from './strings';
import { useSecretTaps } from './Diagnostics';

export function Toolbar() {
  const s = useAppStore();
  const flagged = s.doc.pages.filter(isFlagged).length;
  const onCounterTap = useSecretTaps(s.openDiagnostics);

  if (s.selecting) {
    const n = s.selection.size;
    return (
      <header className="toolbar">
        <button type="button" className="btn" onClick={s.toggleSelecting}>
          {strings.selectDone}
        </button>
        <span className="toolbar-text">{strings.selectedCount(n)}</span>
        <span className="toolbar-spacer" />
        <button type="button" className="btn" disabled={n === 0} onClick={() => s.rotate(s.selection, 90)}>
          {strings.rotate}
        </button>
        <button type="button" className="btn btn-danger" disabled={n === 0} onClick={() => s.remove(s.selection)}>
          {strings.remove}
        </button>
      </header>
    );
  }

  return (
    <header className="toolbar">
      <button
        type="button"
        className="btn btn-icon"
        aria-label={strings.close}
        title={strings.close}
        onClick={() => {
          if (window.confirm(strings.confirmClose)) s.goHome();
        }}
      >
        ✕
      </button>
      <div className="toolbar-check">
        {/* 5 taps on the counter open the diagnostics screen (Home: the title) */}
        <span className={flagged ? 'toolbar-text flag-text' : 'toolbar-text'} onClick={onCounterTap}>
          {strings.toCheck(flagged)}
        </span>
        {(flagged > 0 || s.filterFlagged) && (
          <button
            type="button"
            className={s.filterFlagged ? 'btn btn-toggle on' : 'btn btn-toggle'}
            aria-pressed={s.filterFlagged}
            onClick={() => s.setFilterFlagged(!s.filterFlagged)}
          >
            {strings.showOnlyFlagged}
          </button>
        )}
      </div>
      <span className="toolbar-spacer" />
      <button type="button" className="btn" disabled={!s.canUndo} onClick={s.undo}>
        {strings.undo}
      </button>
      <button type="button" className="btn" disabled={!s.canRedo} onClick={s.redo}>
        {strings.redo}
      </button>
      <button type="button" className="btn" onClick={s.toggleSelecting}>
        {strings.select}
      </button>
      <Settings />
      <button
        type="button"
        className="btn btn-primary"
        disabled={s.busy !== null || s.phase === 'analyzing' || s.doc.pages.length === 0}
        onClick={() => void s.export()}
      >
        {s.busy === 'exporting' ? strings.saving : strings.save}
      </button>
    </header>
  );
}

export function Settings() {
  const { deskew, setDeskew } = useAppStore();
  const [open, setOpen] = useState(false);
  return (
    <div className="settings">
      <button
        type="button"
        className="btn btn-icon"
        aria-label={strings.settings}
        title={strings.settings}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        ⚙
      </button>
      {open && (
        <div className="settings-panel">
          <label className="switch-row">
            <input type="checkbox" checked={deskew} onChange={(e) => setDeskew(e.target.checked)} />
            <span>{strings.deskew}</span>
          </label>
          <p className="settings-hint">{strings.deskewHint}</p>
        </div>
      )}
    </div>
  );
}
