import { useBackdropClose } from './backdrop';
import { useEffect, useState } from 'react';
import { useAppStore } from './store';
import { strings } from './strings';

/** "Kopiuj tekst": the page's text (its own, or recognized), ready to copy with a fresh tap. */
export function TextSheet({ pageId, onClose }: { pageId: string; onClose(): void }) {
  const backdrop = useBackdropClose(() => onClose());
  const { pageText, copyText } = useAppStore();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    pageText(pageId)
      .then((t) => alive && setText(t.trim()))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [pageId, pageText]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" {...backdrop}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.pageText}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.pageText}</h2>
        {failed ? (
          <p className="sheet-sub">{strings.genericError}</p>
        ) : text === null ? (
          <p className="sheet-sub">{strings.readingText}</p>
        ) : text === '' ? (
          <p className="sheet-sub">{strings.noText}</p>
        ) : (
          <textarea className="text-box" aria-label={strings.pageText} value={text} onChange={(e) => setText(e.target.value)} />
        )}
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            {strings.close}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!text}
            onClick={() => {
              if (!text) return;
              void copyText(text).then(
                () => setCopied(true),
                () => setFailed(true),
              );
            }}
          >
            {copied ? strings.copied : strings.copy}
          </button>
        </div>
      </div>
    </div>
  );
}
