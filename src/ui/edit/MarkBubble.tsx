import { HIGHLIGHT_COLORS, INK_COLORS, type HighlightColor, type InkColor, type Mark } from '../../model/document';
import { HIGHLIGHT } from '../../edit/draw';
import { INK, TICK_FRAC, type MarkSize } from '../../edit/text';
import { strings } from '../strings';
import { HL_LABEL, INK_LABEL, SizePicker, Swatches } from './EditTools';

const COVER_PAINT = { black: '#000000', white: '#ffffff' } as const;
const COVER_LABEL = (c: 'black' | 'white') => (c === 'black' ? strings.coverBlack : strings.coverWhite);

/** Size step of a tick / cross from its width. */
function tickSize(w: number): MarkSize {
  const sizes = [1, 2, 3] as const;
  return sizes.reduce((best, s) => (Math.abs(TICK_FRAC[s] - w) < Math.abs(TICK_FRAC[best] - w) ? s : best), 2 as MarkSize);
}

/** Little panel over the selected item: its colour, its size, change text, duplicate, remove. */
export function MarkBubble({
  mark,
  onInk,
  onHighlight,
  onCover,
  onSize,
  onEditText,
  onDuplicate,
  onAllPages,
  onRemove,
}: {
  mark: Mark;
  onInk(c: InkColor): void;
  onHighlight(c: HighlightColor): void;
  onCover(c: 'black' | 'white'): void;
  onSize(s: MarkSize): void;
  onEditText(): void;
  onDuplicate(): void;
  /** Missing when the document has one page. */
  onAllPages?(): void;
  onRemove(): void;
}) {
  const sized = mark.kind === 'text' || mark.kind === 'check' || mark.kind === 'cross' || mark.kind === 'pen';
  const size = mark.kind === 'text' ? (mark.size as MarkSize) : mark.kind === 'pen' ? (mark.width ?? 1) : sized ? tickSize(mark.w) : undefined;
  return (
    <div className="mark-bubble" role="group" aria-label={strings.selectedItem} onPointerDown={(e) => e.stopPropagation()}>
      <div className="mark-bubble-row">
        {mark.kind === 'cover' ? (
          <Swatches colors={['black', 'white'] as const} value={mark.color} paint={COVER_PAINT} label={COVER_LABEL} onPick={onCover} />
        ) : mark.kind === 'highlight' ? (
          <Swatches colors={HIGHLIGHT_COLORS} value={mark.color} paint={HIGHLIGHT} label={HL_LABEL} onPick={onHighlight} />
        ) : (
          <Swatches colors={INK_COLORS} value={mark.color} paint={INK} label={INK_LABEL} onPick={onInk} />
        )}
      </div>
      <div className="mark-bubble-row">
        {sized && <SizePicker value={size} onPick={onSize} />}
        {mark.kind === 'text' && (
          <button type="button" className="mark-bubble-btn" aria-label={strings.changeText} title={strings.changeText} onClick={onEditText}>
            ✎
          </button>
        )}
        <button type="button" className="mark-bubble-btn" aria-label={strings.duplicate} title={strings.duplicate} onClick={onDuplicate}>
          ⧉
        </button>
        {onAllPages && (
          <button type="button" className="mark-bubble-btn wide" onClick={onAllPages}>
            {strings.onAllPages}
          </button>
        )}
        <button type="button" className="mark-bubble-btn danger" aria-label={strings.removeMark} title={strings.removeMark} onClick={onRemove}>
          🗑
        </button>
      </div>
    </div>
  );
}
