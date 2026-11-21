import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Box, Mark, Page } from '../../model/document';
import { dragCrop, type CropHandle } from '../../signature/geometry';
import { useAppStore } from '../store';
import { strings } from '../strings';
import type { Rect } from './pageBox';
import { Marks } from './MarksSvg';

export type EditTool = 'cover' | 'crop' | PlaceTool | null;
/** Tools that put something on the page with a tap. */
export type PlaceTool = 'write' | 'tick' | 'cross' | 'date';
export const PLACE_TOOLS: readonly PlaceTool[] = ['write', 'tick', 'cross', 'date'];
const isPlaceTool = (t: EditTool): t is PlaceTool => PLACE_TOOLS.includes(t as PlaceTool);
export type CoverColor = 'black' | 'white';

const COVER_FILL = { black: '#000', white: '#fff' } as const;
/** A tap (no drag) with Zasłoń places a box of this size around the finger. */
const TAP_BOX = { w: 0.3, h: 0.05 };
const MIN = 0.02;
const CORNERS: CropHandle[] = ['nw', 'ne', 'sw', 'se'];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const hasBox = (m: Mark): m is Extract<Mark, Box> => 'w' in m;

/** Marks of the page drawn over the preview; in "Edytuj" they can be made, moved, resized, removed. */
export function MarkLayer({
  page,
  rect,
  editing,
  tool,
  coverColor,
  selectedId,
  onSelect,
  onPlace,
  onEditText,
}: {
  page: Page;
  rect: Rect;
  editing: boolean;
  tool: EditTool;
  coverColor: CoverColor;
  selectedId: string | null;
  onSelect(id: string | null): void;
  /** A tap on the page with Wpisz / ✓ / ✗ / Data, at page fractions. */
  onPlace(tool: PlaceTool, at: { x: number; y: number }): void;
  /** A second tap on a selected text: change it. */
  onEditText(m: Extract<Mark, { kind: 'text' }>): void;
}) {
  const { addMark, updateMark, removeMark } = useAppStore();
  /** The box being dragged (new cover, or a mark being moved/resized), before it is committed. */
  const [live, setLive] = useState<{ id: string; box: Box } | null>(null);

  /** Pointer position as fractions of the page. */
  const frac = (e: { clientX: number; clientY: number }, layer: HTMLElement) => {
    const b = layer.getBoundingClientRect();
    return { x: (e.clientX - b.left) / rect.width, y: (e.clientY - b.top) / rect.height };
  };

  const follow = (el: HTMLElement, pointerId: number, move: (e: PointerEvent) => void, up: (e: PointerEvent) => void) => {
    el.setPointerCapture?.(pointerId);
    const end = (e: PointerEvent) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      up(e);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };

  /** Drawing a new cover on an empty part of the page. */
  const onLayerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing || e.target !== e.currentTarget) return;
    if (isPlaceTool(tool)) {
      e.preventDefault();
      const layer = e.currentTarget;
      const a = frac(e, layer);
      let moved = false;
      follow(
        layer,
        e.pointerId,
        (ev) => {
          const b = frac(ev, layer);
          if (Math.hypot((b.x - a.x) * rect.width, (b.y - a.y) * rect.height) > 10) moved = true;
        },
        () => {
          if (!moved) onPlace(tool, a);
        },
      );
      return;
    }
    if (tool !== 'cover') {
      onSelect(null);
      return;
    }
    e.preventDefault();
    const layer = e.currentTarget;
    const a = frac(e, layer);
    let box: Box = { x: a.x, y: a.y, w: 0, h: 0 };
    const id = crypto.randomUUID();
    follow(
      layer,
      e.pointerId,
      (ev) => {
        const b = frac(ev, layer);
        const x = clamp01(Math.min(a.x, b.x));
        const y = clamp01(Math.min(a.y, b.y));
        box = { x, y, w: clamp01(Math.max(a.x, b.x)) - x, h: clamp01(Math.max(a.y, b.y)) - y };
        setLive({ id, box });
      },
      () => {
        setLive(null);
        if (box.w < MIN && box.h < MIN) {
          // a tap: a ready-made box around the finger
          box = {
            x: clamp01(a.x - TAP_BOX.w / 2),
            y: clamp01(a.y - TAP_BOX.h / 2),
            w: TAP_BOX.w,
            h: TAP_BOX.h,
          };
          box.x = Math.min(box.x, 1 - box.w);
          box.y = Math.min(box.y, 1 - box.h);
        } else {
          box = { ...box, w: Math.max(box.w, MIN), h: Math.max(box.h, MIN) };
        }
        addMark(page.id, { id, kind: 'cover', color: coverColor, ...box });
        onSelect(id);
      },
    );
  };

  /** Moving (middle) or resizing (corner) a mark: one undo step per drag. */
  const onItemDown = (m: Extract<Mark, Box>, handle: CropHandle) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const wasSelected = m.id === selectedId;
    onSelect(m.id);
    const layer = e.currentTarget.closest('.mark-layer') as HTMLElement;
    const a = frac(e, layer);
    const from: Box = { x: m.x, y: m.y, w: m.w, h: m.h };
    // text and ticks keep their shape when resized (the text grows with the box height)
    const keepShape = m.kind !== 'cover' && handle !== 'move';
    let box = from;
    let moved = false;
    follow(
      e.currentTarget,
      e.pointerId,
      (ev) => {
        const b = frac(ev, layer);
        if (Math.hypot((b.x - a.x) * rect.width, (b.y - a.y) * rect.height) > 6) moved = true;
        if (!moved) return;
        box = dragCrop(from, handle, b.x - a.x, b.y - a.y, 1, 1, MIN);
        if (keepShape) {
          const w = Math.min(1 - box.x, from.w * (box.h / from.h));
          box = { ...box, w, x: handle === 'nw' || handle === 'sw' ? from.x + from.w - w : box.x };
        }
        setLive({ id: m.id, box });
      },
      () => {
        setLive(null);
        if (moved && box !== from) updateMark(page.id, m.id, box);
        else if (!moved && wasSelected && handle === 'move' && m.kind === 'text') onEditText(m);
      },
    );
  };

  const items = (page.marks ?? []).filter(hasBox);
  const boxOf = (m: Extract<Mark, Box>): Box => (live?.id === m.id ? live.box : m);
  const drawing = live && !items.some((m) => m.id === live.id) ? live.box : null;
  const pct = (v: number) => `${v * 100}%`;

  return (
    <div
      className={editing && (tool === 'cover' || isPlaceTool(tool)) ? 'mark-layer drawing' : editing ? 'mark-layer editing' : 'mark-layer'}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      onPointerDown={onLayerDown}
    >
      <Marks marks={page.marks} pageW={rect.width} pageH={rect.height} boxOf={boxOf} />
      {drawing && (
        <svg className="marks-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <rect x={drawing.x} y={drawing.y} width={drawing.w} height={drawing.h} fill={COVER_FILL[coverColor]} opacity={0.8} />
        </svg>
      )}
      {editing &&
        items.map((m) => {
          const b = boxOf(m);
          const selected = m.id === selectedId;
          return (
            <div
              key={m.id}
              data-mark={m.id}
              className={selected ? 'mark-item selected' : 'mark-item'}
              style={{ left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) }}
              onPointerDown={onItemDown(m, 'move')}
            >
              {selected && (
                <>
                  {CORNERS.map((c) => (
                    <span key={c} className={`mark-handle ${c}`} aria-hidden="true" onPointerDown={onItemDown(m, c)} />
                  ))}
                  <button
                    type="button"
                    className="mark-remove"
                    aria-label={strings.removeMark}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      removeMark(page.id, m.id);
                      onSelect(null);
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          );
        })}
    </div>
  );
}
