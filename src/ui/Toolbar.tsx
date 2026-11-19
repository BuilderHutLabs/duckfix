import { ThemePicker } from './ThemePicker';
import { useEffect, useRef, useState } from 'react';
import { isFlagged, useAppStore } from './store';
import { strings } from './strings';
import { IconClose, IconFilter, IconGear, IconRedo, IconUndo } from './icons';
import { MoreMenu } from './MoreMenu';

export function Toolbar() {
  const s = useAppStore();
  const flagged = s.doc.pages.filter(isFlagged).length;

  if (s.selecting) {
    return (
      <header className="toolbar">
        <button type="button" className="btn btn-plain" onClick={s.toggleSelecting}>
          {strings.selectDone}
        </button>
        <span className="toolbar-text">{strings.selectedCount(s.selection.size)}</span>
        <span className="toolbar-spacer" />
      </header>
    );
  }

  const capsuleClass = flagged > 0 ? 'capsule flag' : 'capsule';
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
        <IconClose />
      </button>
      {flagged > 0 || s.filterFlagged ? (
        <button
          type="button"
          className={s.filterFlagged ? `${capsuleClass} on` : capsuleClass}
          aria-pressed={s.filterFlagged}
          aria-label={`${strings.toCheck(flagged)}. ${strings.showOnlyFlagged}`}
          title={strings.showOnlyFlagged}
          onClick={() => s.setFilterFlagged(!s.filterFlagged)}
        >
          <IconFilter />
          <span className="capsule-text">{strings.toCheckShort(flagged)}</span>
        </button>
      ) : (
        <span className={capsuleClass}>
          <span className="capsule-text">{strings.toCheckShort(flagged)}</span>
        </span>
      )}
      <span className="toolbar-spacer" />
      <button
        type="button"
        className="btn btn-icon"
        aria-label={strings.undo}
        title={strings.undo}
        disabled={!s.canUndo}
        onClick={s.undo}
      >
        <IconUndo />
      </button>
      <button
        type="button"
        className="btn btn-icon"
        aria-label={strings.redo}
        title={strings.redo}
        disabled={!s.canRedo}
        onClick={s.redo}
      >
        <IconRedo />
      </button>
      <MoreMenu />
    </header>
  );
}

/** Home's ⚙ settings popover (the review screen has the deskew switch in its ⋯ menu). */
export function Settings() {
  const { deskew, setDeskew } = useAppStore();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="settings" ref={root}>
      <button
        type="button"
        className="btn btn-icon"
        aria-label={strings.settings}
        title={strings.settings}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <IconGear />
      </button>
      {open && (
        <div className="settings-panel">
          <label className="switch-row">
            <input type="checkbox" checked={deskew} onChange={(e) => setDeskew(e.target.checked)} />
            <span>{strings.deskew}</span>
          </label>
          <p className="settings-hint">{strings.deskewHint}</p>
          <div className="menu-sep" />
          <ThemePicker />
        </div>
      )}
    </div>
  );
}
