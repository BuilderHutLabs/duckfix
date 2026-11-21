import { strings } from '../strings';
import type { CoverColor, EditTool } from './MarkLayer';

/** Tool strip at the bottom of the preview in "Edytuj". */
export function EditTools({
  tool,
  onTool,
  coverColor,
  onCoverColor,
  onSign,
  onCropAll,
  onCropNone,
}: {
  tool: EditTool;
  onTool(t: EditTool): void;
  coverColor: CoverColor;
  onCoverColor(c: CoverColor): void;
  onSign(): void;
  onCropAll(): void;
  onCropNone(): void;
}) {
  const toggle = (t: Exclude<EditTool, null>) => () => onTool(tool === t ? null : t);
  return (
    <div className="edit-tools" role="toolbar" aria-label={strings.edit}>
      {tool === 'cover' && (
        <div className="edit-options">
          <p className="edit-hint">{strings.coverHint}</p>
          <div className="segmented" role="group">
            <button type="button" aria-pressed={coverColor === 'black'} onClick={() => onCoverColor('black')}>
              {strings.coverBlack}
            </button>
            <button type="button" aria-pressed={coverColor === 'white'} onClick={() => onCoverColor('white')}>
              {strings.coverWhite}
            </button>
          </div>
        </div>
      )}
      {tool === 'crop' && (
        <div className="edit-options">
          <p className="edit-hint">{strings.pageCropHint}</p>
          <div className="edit-buttons">
            <button type="button" className="btn" onClick={onCropAll}>
              {strings.pageCropAll}
            </button>
            <button type="button" className="btn" onClick={onCropNone}>
              {strings.pageCropNone}
            </button>
          </div>
        </div>
      )}
      <div className="edit-strip">
        <button type="button" className="edit-tool" aria-pressed={tool === 'cover'} onClick={toggle('cover')}>
          <span className="edit-tool-icon" aria-hidden="true">▬</span>
          {strings.cover}
        </button>
        <button type="button" className="edit-tool" aria-pressed={tool === 'crop'} onClick={toggle('crop')}>
          <span className="edit-tool-icon" aria-hidden="true">⛶</span>
          {strings.pageCrop}
        </button>
        <button type="button" className="edit-tool" onClick={onSign}>
          <span className="edit-tool-icon" aria-hidden="true">✍</span>
          {strings.sign}
        </button>
      </div>
    </div>
  );
}
