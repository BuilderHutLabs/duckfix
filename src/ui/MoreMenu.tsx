import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ top: 0, right: 12 });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: Event) => {
      if (!root.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node)) setOpen(false);
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
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPlace({
            top: r.bottom + 6,
            right: Math.max(12, window.innerWidth - r.right),
          });
          setOpen(!open);
        }}
      >
        <IconMore />
      </button>
      {/* on <body>, fixed under the button: inside the top bar it was clipped and covered by the progress bar */}
      {open &&
        createPortal(
          <div
            className="menu-panel menu-floating"
            ref={panel}
            style={{
              top: place.top,
              right: place.right,
              maxHeight: `calc(100dvh - ${place.top + 12}px)`,
            }}
          >
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
          </div>,
          document.body,
        )}
      {/* on <body>: the top bar's backdrop-filter would otherwise pin the fixed sheet to the bar */}
      {signatureOpen &&
        createPortal(<SignatureSheet onClose={() => setSignatureOpen(false)} onSaved={() => setSignatureOpen(false)} />, document.body)}
    </div>
  );
}
