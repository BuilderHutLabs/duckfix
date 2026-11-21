import type { InkColor } from '../../model/document';
import { INK, type MarkSize } from '../../edit/text';
import { strings } from '../strings';
import { PLACE_TOOLS, type CoverColor, type EditTool, type PlaceTool } from './MarkLayer';

const INK_LABEL = (c: InkColor) => (c === 'black' ? strings.inkBlack : c === 'blue' ? strings.inkBlue : strings.inkRed);
const SIZE_LABEL = (s: MarkSize) => (s === 1 ? strings.sizeSmall : s === 2 ? strings.sizeMedium : strings.sizeLarge);
const PLACE_HINT: Record<PlaceTool, () => string> = {
  write: () => strings.writeHint,
  tick: () => strings.tickHint,
  cross: () => strings.tickHint,
  date: () => strings.dateHint,
};

/** Tool strip at the bottom of the preview in "Edytuj". */
export function EditTools({
  tool,
  onTool,
  coverColor,
  onCoverColor,
  ink,
  onInk,
  size,
  onSize,
  onSign,
  onCropAll,
  onCropNone,
}: {
  tool: EditTool;
  onTool(t: EditTool): void;
  coverColor: CoverColor;
  onCoverColor(c: CoverColor): void;
  ink: InkColor;
  onInk(c: InkColor): void;
  size: MarkSize;
  onSize(s: MarkSize): void;
  onSign(): void;
  onCropAll(): void;
  onCropNone(): void;
}) {
  const toggle = (t: Exclude<EditTool, null>) => () => onTool(tool === t ? null : t);
  const placing = PLACE_TOOLS.includes(tool as PlaceTool);
  const toolButton = (t: Exclude<EditTool, null>, icon: string, label: string) => (
    <button type="button" className="edit-tool" aria-pressed={tool === t} aria-label={label} onClick={toggle(t)}>
      <span className="edit-tool-icon" aria-hidden="true">
        {icon}
      </span>
      <span aria-hidden="true">{label}</span>
    </button>
  );

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
      {placing && (
        <div className="edit-options">
          <p className="edit-hint">{PLACE_HINT[tool as PlaceTool]()}</p>
          <div className="edit-style">
            {(['black', 'blue', 'red'] as const).map((c) => (
              <button
                key={c}
                type="button"
                className="ink-swatch"
                aria-pressed={ink === c}
                aria-label={INK_LABEL(c)}
                style={{ background: INK[c] }}
                onClick={() => onInk(c)}
              />
            ))}
            <div className="segmented edit-sizes" role="group">
              {([1, 2, 3] as const).map((s) => (
                <button key={s} type="button" aria-pressed={size === s} aria-label={SIZE_LABEL(s)} onClick={() => onSize(s)}>
                  <span style={{ fontSize: 10 + s * 3 }} aria-hidden="true">
                    A
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="edit-strip">
        {toolButton('write', 'T', strings.toolWrite)}
        {toolButton('tick', '✓', strings.toolTick)}
        {toolButton('cross', '✗', strings.toolCross)}
        {toolButton('date', '📅', strings.toolDate)}
        {toolButton('cover', '▬', strings.cover)}
        {toolButton('crop', '⛶', strings.pageCrop)}
        <button type="button" className="edit-tool" aria-label={strings.sign} onClick={onSign}>
          <span className="edit-tool-icon" aria-hidden="true">
            ✍
          </span>
          <span aria-hidden="true">{strings.sign}</span>
        </button>
      </div>
    </div>
  );
}
