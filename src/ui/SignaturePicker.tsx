import { useEffect } from 'react';
import { useBackdropClose } from './backdrop';
import type { SignatureKind, StoredSignature } from '../signature/storage';
import { strings } from './strings';

/**
 * "Twoje podpisy": the signatures and initials saved on this phone. A tap puts one on the page;
 * initials can go on every page at once; new ones are added here, old ones removed.
 */
export function SignaturePicker({
  items,
  onPick,
  onAllPages,
  onNew,
  onRemove,
  onClose,
}: {
  items: StoredSignature[];
  onPick(s: StoredSignature): void;
  /** Missing when the document has one page. */
  onAllPages?(s: StoredSignature): void;
  onNew(kind: SignatureKind): void;
  onRemove(id: string): void;
  onClose(): void;
}) {
  const backdrop = useBackdropClose(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const label = (s: StoredSignature) => {
    const same = items.filter((x) => x.kind === s.kind);
    const base = s.kind === 'initials' ? strings.initialsLabel : strings.signatureLabel;
    return same.length > 1 ? `${base} ${same.indexOf(s) + 1}` : base;
  };
  const initials = items.find((s) => s.kind === 'initials');

  return (
    <div className="sheet-backdrop" {...backdrop}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.signaturesTitle}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.signaturesTitle}</h2>
        <div className="sig-grid">
          {items.map((s) => (
            <div key={s.id} className="sig-tile">
              <button type="button" className="sig-pick" aria-label={label(s)} onClick={() => onPick(s)}>
                <img src={s.src} alt="" />
                <span aria-hidden="true">{label(s)}</span>
              </button>
              <button
                type="button"
                className="sig-remove"
                aria-label={strings.signatureRemove}
                title={strings.signatureRemove}
                onClick={() => window.confirm(strings.signatureRemoveConfirm) && onRemove(s.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {initials && onAllPages && (
          <button type="button" className="btn sig-all" onClick={() => onAllPages(initials)}>
            {strings.initialsAllPages}
          </button>
        )}
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => onNew('signature')}>
            {strings.signatureNew}
          </button>
          <button type="button" className="btn" onClick={() => onNew('initials')}>
            {strings.initialsNew}
          </button>
        </div>
        <p className="sheet-option-hint sig-local">{strings.signatureLocal}</p>
      </div>
    </div>
  );
}
