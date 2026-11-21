import { HIGHLIGHT_COLORS, INK_COLORS, type HighlightColor, type InkColor } from '../../model/document';
import { HIGHLIGHT } from '../../edit/draw';
import { INK, type MarkSize } from '../../edit/text';
import { strings } from '../strings';
import { DRAW_TOOLS, PLACE_TOOLS, type CoverColor, type DrawTool, type EditTool, type PlaceTool } from './MarkLayer';

export const INK_LABEL = (c: InkColor) =>
  ({
    black: strings.inkBlack,
    blue: strings.inkBlue,
    red: strings.inkRed,
    green: strings.inkGreen,
    orange: strings.inkOrange,
    purple: strings.inkPurple,
    white: strings.inkWhite,
  })[c];
export const SIZE_LABEL = (s: MarkSize) => (s === 1 ? strings.sizeSmall : s === 2 ? strings.sizeMedium : strings.sizeLarge);
export const HL_LABEL = (c: HighlightColor) =>
  ({ yellow: strings.hlYellow, green: strings.hlGreen, pink: strings.hlPink, blue: strings.hlBlue, orange: strings.hlOrange })[c];
const HINT: Record<PlaceTool | DrawTool, () => string> = {
  write: () => strings.writeHint,
  tick: () => strings.tickHint,
  cross: () => strings.tickHint,
  date: () => strings.dateHint,
  pen: () => strings.penHint,
  highlight: () => strings.highlightHint,
  eraser: () => strings.eraserHint,
  arrow: () => strings.arrowHint,
  rect: () => strings.shapeHint,
  ellipse: () => strings.shapeHint,
};

export type ToolGroup = 'write' | 'draw' | 'hide';
type Tool = Exclude<EditTool, null>;
/** The tools of each group, with their icon and name. */
const GROUPS: Record<ToolGroup, Array<[Tool, string, () => string]>> = {
  write: [
    ['write', 'T', () => strings.toolWrite],
    ['date', '📅', () => strings.toolDate],
    ['tick', '✓', () => strings.toolTick],
    ['cross', '✗', () => strings.toolCross],
  ],
  draw: [
    ['pen', '✎', () => strings.toolPen],
    ['highlight', '🖍', () => strings.toolHighlight],
    ['eraser', '⌫', () => strings.toolEraser],
    ['arrow', '↗', () => strings.toolArrow],
    ['rect', '▭', () => strings.toolRect],
    ['ellipse', '◯', () => strings.toolEllipse],
  ],
  hide: [
    ['cover', '▬', () => strings.cover],
    ['crop', '⛶', () => strings.pageCrop],
  ],
};
const GROUP_TABS: Array<[ToolGroup, string, () => string]> = [
  ['write', 'Aa', () => strings.groupWrite],
  ['draw', '✎', () => strings.groupDraw],
  ['hide', '▬', () => strings.groupHide],
];

/** Colour dots: ink, or highlighter colours. */
export function Swatches<C extends string>({
  colors,
  value,
  paint,
  label,
  onPick,
}: {
  colors: readonly C[];
  value: C | undefined;
  paint: Record<C, string>;
  label(c: C): string;
  onPick(c: C): void;
}) {
  return (
    <>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className="ink-swatch"
          aria-pressed={value === c}
          aria-label={label(c)}
          style={{ background: paint[c] }}
          onClick={() => onPick(c)}
        />
      ))}
    </>
  );
}

export function SizePicker({ value, onPick }: { value: MarkSize | undefined; onPick(s: MarkSize): void }) {
  return (
    <div className="segmented edit-sizes" role="group">
      {([1, 2, 3] as const).map((s) => (
        <button key={s} type="button" aria-pressed={value === s} aria-label={SIZE_LABEL(s)} onClick={() => onPick(s)}>
          <span style={{ fontSize: 10 + s * 3 }} aria-hidden="true">
            A
          </span>
        </button>
      ))}
    </div>
  );
}

/** Tool panel at the bottom of the preview in "Edytuj": groups, their tools, the chosen tool's options; it can fold away. */
export function EditTools({
  tool,
  onTool,
  group,
  onGroup,
  folded,
  onFold,
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
  group: ToolGroup;
  onGroup(g: ToolGroup): void;
  folded: boolean;
  onFold(folded: boolean): void;
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
  const placing = PLACE_TOOLS.includes(tool as PlaceTool);
  const drawing = DRAW_TOOLS.includes(tool as DrawTool);

  return (
    <div className={folded ? 'edit-tools folded' : 'edit-tools'} role="toolbar" aria-label={strings.edit}>
      <button
        type="button"
        className="edit-grip"
        aria-expanded={!folded}
        aria-label={folded ? strings.toolsShow : strings.toolsHide}
        onClick={() => onFold(!folded)}
      >
        <span aria-hidden="true" />
      </button>
      {!folded && (
        <>
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
                {tool === 'eraser' ? null : tool === 'highlight' ? (
                  <Swatches colors={HIGHLIGHT_COLORS} value={highlight} paint={HIGHLIGHT} label={HL_LABEL} onPick={onHighlight} />
                ) : (
                  <Swatches colors={INK_COLORS} value={ink} paint={INK} label={INK_LABEL} onPick={onInk} />
                )}
                {(placing || tool === 'pen') && <SizePicker value={size} onPick={onSize} />}
              </div>
            </div>
          )}
          <div className="edit-strip">
            {GROUPS[group].map(([t, icon, label]) => (
              <button
                key={t}
                type="button"
                className="edit-tool"
                aria-pressed={tool === t}
                aria-label={label()}
                onClick={() => onTool(tool === t ? null : t)}
              >
                <span className="edit-tool-icon" aria-hidden="true">
                  {icon}
                </span>
                <span aria-hidden="true">{label()}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="edit-groups" role="group">
        {GROUP_TABS.map(([g, icon, label]) => (
          <button
            key={g}
            type="button"
            className="edit-group"
            aria-pressed={group === g}
            onClick={() => {
              onGroup(g);
              onFold(false);
            }}
          >
            <span className="edit-group-icon" aria-hidden="true">
              {icon}
            </span>
            {label()}
          </button>
        ))}
        <button type="button" className="edit-group" aria-label={strings.sign} onClick={onSign}>
          <span className="edit-group-icon" aria-hidden="true">
            ✍
          </span>
          <span aria-hidden="true">{strings.sign}</span>
        </button>
      </div>
    </div>
  );
}
