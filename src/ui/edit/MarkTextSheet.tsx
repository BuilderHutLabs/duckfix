import { useBackdropClose } from '../backdrop';
import { useEffect, useRef, useState } from 'react';
import { strings } from '../strings';

/** "Wpisz": type the text for the page (new, or changing a text already on it). */
export function MarkTextSheet({ initial, onDone, onClose }: { initial: string; onDone(text: string): void; onClose(): void }) {
  const backdrop = useBackdropClose(() => onClose());
  const [text, setText] = useState(initial);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const done = () => {
    const t = text.replace(/\s+$/, '');
    if (t.trim()) onDone(t);
    else onClose();
  };

  return (
    <div className="sheet-backdrop" {...backdrop}>
      <div className="sheet write-sheet" role="dialog" aria-modal="true" aria-label={strings.writeTitle}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.writeTitle}</h2>
        <textarea
          ref={box}
          className="write-box"
          aria-label={strings.writeTitle}
          rows={3}
          value={text}
          placeholder={strings.writePlaceholder}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={onClose}>
            {strings.cancel}
          </button>
          <button type="button" className="btn btn-primary" onClick={done}>
            {strings.writeInsert}
          </button>
        </div>
      </div>
    </div>
  );
}
