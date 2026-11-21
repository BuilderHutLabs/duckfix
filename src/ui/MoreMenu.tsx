import { useEffect, useRef, useState } from 'react';
import { IconMore } from './icons';
import { useAppStore } from './store';
import { strings } from './strings';
import { ThemePicker } from './ThemePicker';
import { SignatureSheet } from './SignatureSheet';

/** The ⋯ popover of the review top bar: select mode, deskew switch, diagnostics. */
export function MoreMenu() {
  const { deskew, setDeskew, toggleSelecting, openDiagnostics, openFilterSheet, doc } = useAppStore();
  const [open, setOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
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

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="more-menu" ref={root}>
      <button
        type="button"
        className="btn btn-icon"
        aria-label={strings.more}
        title={strings.more}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
      >
        <IconMore />
      </button>
      {open && (
        <div className="menu-panel">
          <button type="button" className="menu-item" onClick={choose(toggleSelecting)}>
            {strings.select}
          </button>
          <button type="button" className="menu-item" onClick={choose(() => openFilterSheet(doc.pages.map((p) => p.id)))}>
            {strings.pageLook}
          </button>
          <button type="button" className="menu-item" onClick={choose(() => setSignatureOpen(true))}>
            {strings.mySignature}
          </button>
          <div className="menu-sep" />
          <label className="switch-row">
            <input type="checkbox" checked={deskew} onChange={(e) => setDeskew(e.target.checked)} />
            <span>{strings.deskew}</span>
          </label>
          <p className="settings-hint">{strings.deskewHint}</p>
          <div className="menu-sep" />
          <ThemePicker />
          <div className="menu-sep" />
          <button type="button" className="menu-item" onClick={choose(openDiagnostics)}>
            {strings.diagnostics}
          </button>
        </div>
      )}
      {signatureOpen && <SignatureSheet onClose={() => setSignatureOpen(false)} onSaved={() => setSignatureOpen(false)} />}
    </div>
  );
}
