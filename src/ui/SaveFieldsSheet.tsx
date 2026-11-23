import { useEffect, useState } from 'react';
import { useBackdropClose } from './backdrop';
import { SAVE_FIELDS, loadSaveFields, saveSaveFields, type SaveField } from './saveFields';
import { strings } from './strings';

const LABEL: Record<SaveField, () => string> = {
  format: () => strings.format,
  size: () => strings.fileSize,
  pages: () => strings.pagesField,
  ocr: () => strings.searchableText,
  split: () => strings.splitPages,
  watermark: () => strings.watermarkSwitch,
  password: () => strings.passwordSwitch,
};

/** "Okno zapisu": which options the save window shows (remembered on this phone). */
export function SaveFieldsSheet({ onClose }: { onClose(): void }) {
  const [fields, setFields] = useState(loadSaveFields);
  const backdrop = useBackdropClose(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (f: SaveField) => {
    const next = { ...fields, [f]: !fields[f] };
    setFields(next);
    saveSaveFields(next);
  };

  return (
    <div className="sheet-backdrop" {...backdrop}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={strings.saveFieldsTitle}>
        <div className="sheet-grabber" aria-hidden="true" />
        <h2 className="sheet-title">{strings.saveFieldsTitle}</h2>
        <p className="sheet-sub">{strings.saveFieldsHint}</p>
        {SAVE_FIELDS.map((f) => (
          <label key={f} className="sheet-option">
            <span className="sheet-option-text">
              <span className="sheet-option-label">{LABEL[f]()}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={fields[f]}
              aria-label={LABEL[f]()}
              className="switch"
              onClick={() => toggle(f)}
            />
          </label>
        ))}
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {strings.close}
          </button>
        </div>
      </div>
    </div>
  );
}
