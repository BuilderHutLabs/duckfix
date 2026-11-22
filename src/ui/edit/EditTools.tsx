import { useRef, useState } from 'react';
import { HIGHLIGHT_COLORS, INK_COLORS, type HighlightColor, type InkColor } from '../../model/document';
import { HIGHLIGHT } from '../../edit/draw';
import { INK, type MarkSize } from '../../edit/text';
import { strings } from '../strings';
import { Icon, type IconName } from './icons';
import { PLACE_TOOLS, type CoverColor, type EditTool, type PlaceTool } from './MarkLayer';

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
const COVER_PAINT = { black: '#000000', white: '#ffffff' } as const;
const COVER_LABEL = (c: CoverColor) => (c === 'black' ? strings.coverBlack : strings.coverWhite);

type Tool = Exclude<EditTool, null>;
const HINT: Record<Tool, () => string> = {
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
  cover: () => strings.coverHint,
  crop: () => strings.pageCropHint,
};

/** The buttons of the tool row; a group with several tools shows them as a choice above. */
export type ToolGroup = 'text' | 'marks' | 'draw' | 'highlight' | 'shapes' | 'hide';
const GROUPS: Array<{ id: ToolGroup; icon: IconName; label: () => string; tools: Tool[] }> = [
  { id: 'text', icon: 'text', label: () => strings.toolWrite, tools: ['write'] },
  { id: 'marks', icon: 'marks', label: () => strings.toolMarks, tools: ['tick', 'cross', 'date'] },
  { id: 'draw', icon: 'draw', label: () => strings.groupDraw, tools: ['pen', 'eraser'] },
  { id: 'highlight', icon: 'highlight', label: () => strings.toolHighlight, tools: ['highlight'] },
  { id: 'shapes', icon: 'shapes', label: () => strings.toolShapes, tools: ['arrow', 'rect', 'ellipse'] },
  { id: 'hide', icon: 'hide', label: () => strings.groupHide, tools: ['cover', 'crop'] },
];
const SUB: Partial<Record<Tool, [IconName, () => string]>> = {
  tick: ['tick', () => strings.toolTick],
  cross: ['cross', () => strings.toolCross],
  date: ['date', () => strings.toolDate],
  pen: ['pen', () => strings.toolPen],
  eraser: ['eraser', () => strings.toolEraser],
  arrow: ['arrow', () => strings.toolArrow],
  rect: ['rect', () => strings.toolRect],
  ellipse: ['ellipse', () => strings.toolEllipse],
  cover: ['cover', () => strings.cover],
  crop: ['crop', () => strings.pageCrop],
};
/** The group a tool belongs to. */
export const groupOf = (t: Tool): ToolGroup => GROUPS.find((g) => g.tools.includes(t))!.id;

/** Colour dots: ink, highlighter or cover colours. */
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

/** Size as three steps on a line (small, medium, large dot). */
export function SizePicker({ value, onPick }: { value: MarkSize | undefined; onPick(s: MarkSize): void }) {
  return (
    <div className="size-steps" role="group">
      {([1, 2, 3] as const).map((s) => (
        <button key={s} type="button" aria-pressed={value === s} aria-label={SIZE_LABEL(s)} onClick={() => onPick(s)}>
          <span style={{ width: 6 + s * 4, height: 6 + s * 4 }} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/**
 * Tool panel at the bottom of the preview in "Edytuj": one row of tools; above it the chosen tool's
 * kind (Ptaszek / Krzyżyk / Data…), a short hint, and its colour and size. It can fold away.
 */
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
  onHidePersonal,
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
  /** "Ukryj dane osobowe": covers what it finds on the page; resolves to how many. */
  onHidePersonal?(): Promise<number>;
}) {
  const [personal, setPersonal] = useState<'busy' | 'failed' | number | null>(null);
  const hidePersonal = () => {
    if (!onHidePersonal || personal === 'busy') return;
    setPersonal('busy');
    onHidePersonal().then(setPersonal, () => setPersonal('failed'));
  };
  /** The tool last used in each group: tapping the group again brings it back. */
  const last = useRef<Partial<Record<ToolGroup, Tool>>>({});
  if (tool) last.current[groupOf(tool)] = tool;
  const active = tool ? GROUPS.find((g) => g.id === groupOf(tool))! : null;
  const placing = PLACE_TOOLS.includes(tool as PlaceTool);

  const pickGroup = (g: (typeof GROUPS)[number]) => {
    onFold(false);
    if (active?.id === g.id) return onTool(null); // tapping the chosen tool puts it away
    onGroup(g.id);
    onTool(last.current[g.id] ?? g.tools[0]);
  };

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
      {!folded && tool && active && (
        <div className="edit-options">
          {active.tools.length > 1 && (
            <div className="edit-kinds" role="group">
              {active.tools.map((t) => (
                <button key={t} type="button" aria-pressed={tool === t} aria-label={SUB[t]![1]()} onClick={() => onTool(t)}>
                  <Icon name={SUB[t]![0]} size={18} />
                  <span aria-hidden="true">{SUB[t]![1]()}</span>
                </button>
              ))}
            </div>
          )}
          <p className="edit-hint">{HINT[tool]()}</p>
          {tool === 'crop' ? (
            <div className="edit-buttons">
              <button type="button" className="btn" onClick={onCropAll}>
                {strings.pageCropAll}
              </button>
              <button type="button" className="btn" onClick={onCropNone}>
                {strings.pageCropNone}
              </button>
            </div>
          ) : tool === 'eraser' ? null : (
            <div className="edit-style">
              {tool === 'cover' ? (
                <Swatches
                  colors={['black', 'white'] as const}
                  value={coverColor}
                  paint={COVER_PAINT}
                  label={COVER_LABEL}
                  onPick={onCoverColor}
                />
              ) : tool === 'highlight' ? (
                <Swatches colors={HIGHLIGHT_COLORS} value={highlight} paint={HIGHLIGHT} label={HL_LABEL} onPick={onHighlight} />
              ) : (
                <Swatches colors={INK_COLORS} value={ink} paint={INK} label={INK_LABEL} onPick={onInk} />
              )}
              {(placing || tool === 'pen') && (
                <>
                  <span className="edit-sep" aria-hidden="true" />
                  <SizePicker value={size} onPick={onSize} />
                </>
              )}
            </div>
          )}
          {tool === 'cover' && onHidePersonal && (
            <>
              <button type="button" className="edit-wide" disabled={personal === 'busy'} onClick={hidePersonal}>
                <Icon name="shield" size={18} />
                {strings.hidePersonal}
              </button>
              {personal !== null && (
                <p className="edit-status" role="status">
                  {personal === 'busy'
                    ? strings.personalBusy
                    : personal === 'failed'
                      ? strings.personalFailed
                      : personal === 0
                        ? strings.personalNone
                        : strings.personalFound(personal)}
                </p>
              )}
            </>
          )}
        </div>
      )}
      <div className="edit-strip">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            className="edit-tool"
            aria-pressed={active?.id === g.id}
            aria-label={g.label()}
            data-group={g.id === group ? 'last' : undefined}
            onClick={() => pickGroup(g)}
          >
            <Icon name={g.icon} />
            <span aria-hidden="true">{g.label()}</span>
          </button>
        ))}
        <button type="button" className="edit-tool" aria-label={strings.sign} onClick={onSign}>
          <Icon name="sign" />
          <span aria-hidden="true">{strings.sign}</span>
        </button>
      </div>
    </div>
  );
}
