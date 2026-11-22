import { useEffect, useState } from 'react';
import { currentLanguage, formatSize } from '../i18n';
import type { DocMeta } from '../storage/library';
import { useBackdropClose } from './backdrop';
import { useAppStore } from './store';
import { strings } from './strings';

const DAY = 24 * 60 * 60 * 1000;

/** "dziś, 17:40", "wczoraj", "20 lis" (with the year when it is another one). */
export function docWhen(ts: number, now = Date.now()): string {
  const lang = currentLanguage();
  const d = new Date(ts);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (ts >= start.getTime()) return `${strings.docToday}, ${d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}`;
  if (ts >= start.getTime() - DAY) return strings.docYesterday;
  const sameYear = d.getFullYear() === start.getFullYear();
  return d.toLocaleDateString(lang, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

const IconPage = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M9 11h6M9 15h6" />
  </svg>
);

/**
 * "Moje dokumenty": every document kept on this phone, newest first. A tap opens one where it was
 * left; ⋯ renames it or deletes it for good.
 */
export function DocsSheet() {
  const { library, closeDocs, openStored, renameStored, removeStored } = useAppStore();
  const [menu, setMenu] = useState<string | null>(null);
  /** The open menu goes up from its row when the row is low on the screen. */
  const [up, setUp] = useState(false);
  const backdrop = useBackdropClose(closeDocs);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menu) setMenu(null);
      else closeDocs();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, closeDocs]);

  const size = library.reduce((n, m) => n + (m.size || 0), 0);
  const rename = (m: DocMeta) => {
    setMenu(null);
    const name = window.prompt(strings.docRenamePrompt, m.name);
    if (name && name.trim() && name.trim() !== m.name) void renameStored(m.id, name);
  };
  const remove = (m: DocMeta) => {
    setMenu(null);
    if (window.confirm(strings.docRemoveConfirm(m.name))) void removeStored(m.id);
  };

  return (
    <div className="sheet-backdrop" {...backdrop}>
      <div
        className="sheet docs-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={strings.docsTitle}
        onPointerDown={(e) => {
          if (menu && !(e.target as Element).closest('.doc-menu, .doc-more')) setMenu(null);
        }}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.docsTitle}</h2>
        {library.length ? (
          <>
            <p className="sheet-sub docs-summary">{strings.docsSummary(library.length, formatSize(size))}</p>
            <ul className="docs-list">
              {library.map((m) => (
                <li key={m.id} className="doc-row">
                  <button type="button" className="doc-open" onClick={() => void openStored(m.id)}>
                    <span className="doc-thumb">{m.thumb ? <img src={m.thumb} alt="" /> : <IconPage />}</span>
                    <span className="doc-text">
                      <strong>{m.name}</strong>
                      <span>
                        {strings.docPages(m.pages)} · {docWhen(m.updatedAt)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="doc-more"
                    aria-label={strings.docMore(m.name)}
                    title={strings.docMore(m.name)}
                    aria-haspopup="menu"
                    aria-expanded={menu === m.id}
                    onClick={(e) => {
                      setUp(e.currentTarget.getBoundingClientRect().top > window.innerHeight * 0.6);
                      setMenu(menu === m.id ? null : m.id);
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="19" cy="12" r="2" />
                    </svg>
                  </button>
                  {menu === m.id && (
                    <div className={up ? 'doc-menu up' : 'doc-menu'} role="menu">
                      <button type="button" role="menuitem" onClick={() => void openStored(m.id)}>
                        {strings.docOpen}
                      </button>
                      <button type="button" role="menuitem" onClick={() => rename(m)}>
                        {strings.docRename}
                      </button>
                      <button type="button" role="menuitem" className="danger" onClick={() => remove(m)}>
                        {strings.docRemove}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="sheet-sub">{strings.docsEmpty}</p>
        )}
      </div>
    </div>
  );
}
