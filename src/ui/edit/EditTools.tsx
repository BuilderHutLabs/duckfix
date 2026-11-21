import type { HighlightColor, InkColor } from '../../model/document';
import { HIGHLIGHT } from '../../edit/draw';
import { INK, type MarkSize } from '../../edit/text';
import { strings } from '../strings';
import { DRAW_TOOLS, PLACE_TOOLS, type CoverColor, type DrawTool, type EditTool, type PlaceTool } from './MarkLayer';

const INK_LABEL = (c: InkColor) => (c === 'black' ? strings.inkBlack : c === 'blue' ? strings.inkBlue : strings.inkRed);
const SIZE_LABEL = (s: MarkSize) => (s === 1 ? strings.sizeSmall : s === 2 ? strings.sizeMedium : strings.sizeLarge);
const HL_LABEL = (c: HighlightColor) => (c === 'yellow' ? strings.hlYellow : c === 'green' ? strings.hlGreen : strings.hlPink);
const HINT: Record<PlaceTool | DrawTool, () => string> = {
  write: () => strings.writeHint,
  tick: () => strings.tickHint,
  cross: () => strings.tickHint,
  date: () => strings.dateHint,
  pen: () => strings.penHint,
  highlight: () => strings.highlightHint,
  arrow: () => strings.arrowHint,
  rect: () => strings.shapeHint,
  ellipse: () => strings.shapeHint,
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
  highlight,
  onHighlight,
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
  highlight: HighlightColor;
  onHighlight(c: HighlightColor): void;
  onSign(): void;
  onCropAll(): void;
  onCropNone(): void;
}) {
  const toggle = (t: Exclude<EditTool, null>) => () => onTool(tool === t ? null : t);
  const placing = PLACE_TOOLS.includes(tool as PlaceTool);
  const drawing = DRAW_TOOLS.includes(tool as DrawTool);
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
      {(placing || drawing) && (
        <div className="edit-options">
          <p className="edit-hint">{HINT[tool as PlaceTool | DrawTool]()}</p>
          <div className="edit-style">
            {tool === 'highlight' &&
              (['yellow', 'green', 'pink'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="ink-swatch"
                  aria-pressed={highlight === c}
                  aria-label={HL_LABEL(c)}
                  style={{ background: HIGHLIGHT[c] }}
                  onClick={() => onHighlight(c)}
                />
              ))}
            {tool !== 'highlight' && (['black', 'blue', 'red'] as const).map((c) => (
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
            {placing && <div className="segmented edit-sizes" role="group">
              {([1, 2, 3] as const).map((s) => (
                <button key={s} type="button" aria-pressed={size === s} aria-label={SIZE_LABEL(s)} onClick={() => onSize(s)}>
                  <span style={{ fontSize: 10 + s * 3 }} aria-hidden="true">
                    A
                  </span>
                </button>
              ))}
            </div>}
          </div>
        </div>
      )}
      <div className="edit-strip">
        {toolButton('write', 'T', strings.toolWrite)}
        {toolButton('tick', '✓', strings.toolTick)}
        {toolButton('cross', '✗', strings.toolCross)}
        {toolButton('date', '📅', strings.toolDate)}
        {toolButton('pen', '✎', strings.toolPen)}
        {toolButton('highlight', '🖍', strings.toolHighlight)}
        {toolButton('arrow', '↗', strings.toolArrow)}
        {toolButton('rect', '▭', strings.toolRect)}
        {toolButton('ellipse', '◯', strings.toolEllipse)}
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
