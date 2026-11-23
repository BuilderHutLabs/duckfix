import { useState, type ReactNode } from 'react';
import { HIGHLIGHT_COLORS, INK_COLORS, type HighlightColor, type InkColor, type Mark } from '../../model/document';
import { HIGHLIGHT } from '../../edit/draw';
import { INK, TICK_FRAC, type MarkSize } from '../../edit/text';
import { strings } from '../strings';
import { HL_LABEL, INK_LABEL, SizePicker, Swatches } from './EditTools';
import { Icon, type IconName } from './icons';

const COVER_PAINT = { black: '#000000', white: '#ffffff' } as const;
const COVER_LABEL = (c: 'black' | 'white') => (c === 'black' ? strings.coverBlack : strings.coverWhite);

/** Size step of a tick / cross from its width. */
function tickSize(w: number): MarkSize {
  const sizes = [1, 2, 3] as const;
  return sizes.reduce((best, s) => (Math.abs(TICK_FRAC[s] - w) < Math.abs(TICK_FRAC[best] - w) ? s : best), 2 as MarkSize);
}

/** One round button of the bubble. */
export function BubbleButton({
  icon,
  label,
  danger,
  pressed,
  onClick,
  children,
}: {
  icon?: IconName;
  label: string;
  danger?: boolean;
  pressed?: boolean;
  onClick(): void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={danger ? 'mark-bubble-btn danger' : 'mark-bubble-btn'}
      aria-label={label}
      title={label}
      aria-expanded={pressed}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} size={19} /> : children}
    </button>
  );
}

/**
 * Small dark bar over the selected item: its colour and size (each opens a row of choices),
 * change text, duplicate, remove, and ⋯ for the rarer "Na wszystkie strony".
 */
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
  const [open, setOpen] = useState<'color' | 'size' | 'more' | null>(null);
  const toggle = (row: 'color' | 'size' | 'more') => setOpen(open === row ? null : row);
  const sized = mark.kind === 'text' || mark.kind === 'check' || mark.kind === 'cross' || mark.kind === 'pen';
  const size =
    mark.kind === 'text' ? (mark.size as MarkSize) : mark.kind === 'pen' ? (mark.width ?? 1) : sized ? tickSize(mark.w) : undefined;
  const paint =
    mark.kind === 'cover' ? COVER_PAINT[mark.color] : mark.kind === 'highlight' ? HIGHLIGHT[mark.color] : INK[mark.color as InkColor];

  return (
    <div className="mark-bubble" role="group" aria-label={strings.selectedItem} onPointerDown={(e) => e.stopPropagation()}>
      {open && (
        <div className="mark-bubble-row mark-bubble-extra">
          {open === 'color' &&
            (mark.kind === 'cover' ? (
              <Swatches colors={['black', 'white'] as const} value={mark.color} paint={COVER_PAINT} label={COVER_LABEL} onPick={onCover} />
            ) : mark.kind === 'highlight' ? (
              <Swatches colors={HIGHLIGHT_COLORS} value={mark.color} paint={HIGHLIGHT} label={HL_LABEL} onPick={onHighlight} />
            ) : (
              <Swatches colors={INK_COLORS} value={mark.color} paint={INK} label={INK_LABEL} onPick={onInk} />
            ))}
          {open === 'size' && <SizePicker value={size} onPick={onSize} />}
          {open === 'more' && onAllPages && (
            <button type="button" className="mark-bubble-wide" onClick={onAllPages}>
              <Icon name="pages" size={18} />
              {strings.onAllPages}
            </button>
          )}
        </div>
      )}
      <div className="mark-bubble-row">
        <BubbleButton label={strings.changeColor} pressed={open === 'color'} onClick={() => toggle('color')}>
          <span className="mark-bubble-dot" style={{ background: paint }} aria-hidden="true" />
        </BubbleButton>
        {sized && (
          <BubbleButton label={strings.changeSize} pressed={open === 'size'} onClick={() => toggle('size')}>
            <span className="mark-bubble-size" aria-hidden="true">
              {size === 1 ? 'S' : size === 3 ? 'L' : 'M'}
            </span>
          </BubbleButton>
        )}
        <span className="mark-bubble-sep" aria-hidden="true" />
        {mark.kind === 'text' && <BubbleButton icon="edit" label={strings.changeText} onClick={onEditText} />}
        <BubbleButton icon="copy" label={strings.duplicate} onClick={onDuplicate} />
        <BubbleButton icon="trash" label={strings.removeMark} danger onClick={onRemove} />
        {onAllPages && (
          <>
            <span className="mark-bubble-sep" aria-hidden="true" />
            <BubbleButton icon="more" label={strings.moreOptions} pressed={open === 'more'} onClick={() => toggle('more')} />
          </>
        )}
      </div>
    </div>
  );
}

/** The same bar for a signature: duplicate, remove, ⋯ "Na wszystkie strony". */
export function StampBubble({
  onChangeDate,
  onDuplicate,
  onAllPages,
  onRemove,
}: {
  /** A ready-made stamp with a date: "Zmień datę". */
  onChangeDate?(): void;
  onDuplicate(): void;
  onAllPages?(): void;
  onRemove(): void;
}) {
  const [more, setMore] = useState(false);
  return (
    <div className="mark-bubble" role="group" aria-label={strings.selectedItem} onPointerDown={(e) => e.stopPropagation()}>
      {more && onAllPages && (
        <div className="mark-bubble-row mark-bubble-extra">
          <button type="button" className="mark-bubble-wide" onClick={onAllPages}>
            <Icon name="pages" size={18} />
            {strings.onAllPages}
          </button>
        </div>
      )}
      <div className="mark-bubble-row">
        {onChangeDate && (
          <>
            <BubbleButton icon="date" label={strings.stampChangeDate} onClick={onChangeDate} />
            <span className="mark-bubble-sep" aria-hidden="true" />
          </>
        )}
        <BubbleButton icon="copy" label={strings.duplicate} onClick={onDuplicate} />
        <BubbleButton icon="trash" label={strings.removeSignature} danger onClick={onRemove} />
        {onAllPages && (
          <>
            <span className="mark-bubble-sep" aria-hidden="true" />
            <BubbleButton icon="more" label={strings.moreOptions} pressed={more} onClick={() => setMore(!more)} />
          </>
        )}
      </div>
    </div>
  );
}
