import { createPortal } from 'react-dom';
import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { Box, HighlightColor, InkColor, Mark, Page } from '../../model/document';
import { dragCrop, type CropHandle } from '../../signature/geometry';
import { simplify, strokeBox } from '../../edit/draw';
import { useAppStore } from '../store';
import type { PageBox } from './pageBox';
import { Marks } from './MarksSvg';

/** Tools that put something on the page with a tap. */
export type PlaceTool = 'write' | 'tick' | 'cross' | 'date';
/** Tools that draw with a finger drag. */
export type DrawTool = 'pen' | 'highlight' | 'eraser' | 'arrow' | 'rect' | 'ellipse';
export type EditTool = 'cover' | 'crop' | PlaceTool | DrawTool | null;
export const PLACE_TOOLS: readonly PlaceTool[] = ['write', 'tick', 'cross', 'date'];
export const DRAW_TOOLS: readonly DrawTool[] = ['pen', 'highlight', 'eraser', 'arrow', 'rect', 'ellipse'];
const isPlaceTool = (t: EditTool): t is PlaceTool => PLACE_TOOLS.includes(t as PlaceTool);
export type CoverColor = 'black' | 'white';

/** A tap (no drag) with Zasłoń places a box of this size around the finger. */
const TAP_BOX = { w: 0.3, h: 0.05 };
const MIN = 0.02;
const CORNERS: CropHandle[] = ['nw', 'ne', 'sw', 'se'];
/** Rough size of the bubble over a selected item (px). */
const BUBBLE = { w: 280, h: 56 };
/**
 * Room between the item and its bubble (px), so the bubble never covers the corner dots
 * (they stick out ~25 px with their touch area, more on a small item) or a signature's turn knob.
 */
export const BUBBLE_GAP = { mark: 40, small: 52, stamp: 70 };
/** Gumka: how close (fraction of the page width) the finger must pass to a drawing to rub it out. */
const ERASE = 0.025;
/** An item smaller than this on screen (px) gets its corner dots further out, so they do not hide it. */
const SMALL_PX = 48;
/** Room around a thin drawing so it can still be grabbed (fraction of the page). */
const GRAB = 0.015;

type Handle = CropHandle | 'start' | 'end';
type BoxMark = Extract<Mark, Box>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const hasBox = (m: Mark): m is BoxMark => 'w' in m;

/** The area that selects a mark: its box (an arrow's box made positive), or around a stroke. */
function hitBox(m: Mark): Box {
  if (!hasBox(m)) {
    const b = strokeBox(m.points);
    return { x: b.x - GRAB, y: b.y - GRAB, w: b.w + 2 * GRAB, h: b.h + 2 * GRAB };
  }
  if (m.kind === 'arrow') {
    const b = { x: Math.min(m.x, m.x + m.w), y: Math.min(m.y, m.y + m.h), w: Math.abs(m.w), h: Math.abs(m.h) };
    return { x: b.x - GRAB, y: b.y - GRAB, w: b.w + 2 * GRAB, h: b.h + 2 * GRAB };
  }
  return m;
}

/** Distance from point p to the segment a–b (all in the same units). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len = vx * vx + vy * vy;
  const t = len ? Math.min(1, Math.max(0, ((px - ax) * vx + (py - ay) * vy) / len)) : 0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Whether the gumka at (x, y) (page fractions; aspect = page height / width) touches a drawing. */
export function erases(m: Mark, x: number, y: number, aspect: number): boolean {
  const r = ERASE;
  if (m.kind === 'pen' || m.kind === 'highlight') {
    const pts = m.points;
    if (pts.length === 2) return Math.hypot(pts[0] - x, (pts[1] - y) * aspect) < r;
    for (let i = 0; i + 3 < pts.length; i += 2) {
      if (segDist(x, y * aspect, pts[i], pts[i + 1] * aspect, pts[i + 2], pts[i + 3] * aspect) < r) return true;
    }
    return false;
  }
  if (m.kind === 'arrow') return segDist(x, y * aspect, m.x, m.y * aspect, m.x + m.w, (m.y + m.h) * aspect) < r;
  if (m.kind === 'rect' || m.kind === 'ellipse') {
    const inX = x > m.x - r && x < m.x + m.w + r;
    const inY = y * aspect > m.y * aspect - r && y * aspect < (m.y + m.h) * aspect + r;
    return inX && inY;
  }
  return false;
}

/** Where the bubble over a selected item goes: over it (under it near the top of the screen), inside the screen sideways. */
export function bubblePlace(b: Box, rect: PageBox, zoom = 1, gap = BUBBLE_GAP.mark): { left: number; top: number; above: boolean } {
  const half = Math.min(BUBBLE.w, rect.stageW - 16) / 2 / zoom;
  const cx = rect.left + (b.x + b.w / 2) * rect.width;
  const left = Math.min(Math.max(cx, half + 8), rect.stageW - half - 8) - rect.left;
  const above = rect.top + b.y * rect.height - (BUBBLE.h + gap) / zoom > 0;
  const top = above ? b.y * rect.height - gap / zoom : (b.y + b.h) * rect.height + gap / zoom;
  return { left, top, above };
}

/**
 * The bubble at a place from bubblePlace; `shift` moves it from page to stage coordinates. With `host`
 * it is drawn there (over the page, outside the crop clip), so a cropped page does not cut it off.
 */
export function BubbleAnchor({
  at,
  zoom,
  shift,
  host,
  children,
}: {
  at: { left: number; top: number; above: boolean };
  zoom: number;
  shift?: { x: number; y: number };
  host?: HTMLElement | null;
  children: ReactNode;
}) {
  const anchor = (
    <div
      className="mark-bubble-anchor"
      style={{ left: at.left + (shift?.x ?? 0), top: at.top + (shift?.y ?? 0), transform: zoom !== 1 ? `scale(${1 / zoom})` : undefined }}
    >
      <div
        className={`mark-bubble-pos ${at.above ? 'above' : 'below'}`}
        style={{ transform: at.above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)' }}
      >
        {children}
      </div>
    </div>
  );
  return host ? createPortal(anchor, host) : anchor;
}

/** A mark moved by (dx, dy) page fractions. */
export function moved(m: Mark, dx: number, dy: number): Mark {
  if (!hasBox(m)) return { ...m, points: m.points.map((v, i) => clamp01(v + (i % 2 ? dy : dx))) };
  if (m.kind === 'arrow') return { ...m, x: m.x + dx, y: m.y + dy };
  return { ...m, ...dragCrop(m, 'move', dx, dy, 1, 1, MIN) };
}

/** Marks of the page drawn over the preview; in "Edytuj" they can be made, moved, resized, removed. */
export function MarkLayer({
  page,
  rect,
  editing,
  tool,
  coverColor,
  ink,
  highlight,
  penWidth = 1,
  zoom = 1,
  bubbleHost,
  selectedId,
  onSelect,
  onPlace,
  onEditText,
  bubble,
}: {
  page: Page;
  rect: PageBox;
  editing: boolean;
  tool: EditTool;
  coverColor: CoverColor;
  /** Colour of new pen lines, arrows and shapes. */
  ink: InkColor;
  /** Colour of new highlighter strokes. */
  highlight: HighlightColor;
  /** Thickness of new pen lines. */
  penWidth?: 1 | 2 | 3;
  /** Pinch zoom of the page in "Edytuj" (the bubble keeps its size). */
  zoom?: number;
  /** Where the bubble is drawn (outside the crop clip); inside the layer when missing. */
  bubbleHost?: HTMLElement | null;
  selectedId: string | null;
  onSelect(id: string | null): void;
  /** A tap on the page with Wpisz / ✓ / ✗ / Data, at page fractions. */
  onPlace(tool: PlaceTool, at: { x: number; y: number }): void;
  /** A second tap on a selected text: change it. */
  onEditText(m: Extract<Mark, { kind: 'text' }>): void;
  /** Panel shown over the selected item (colour, size, duplicate, remove). */
  bubble?(m: Mark): ReactNode;
}) {
  const { addMark, updateMark, removeMarks } = useAppStore();
  /** A mark being drawn or changed, shown before it is committed (one undo step per gesture). */
  const [live, setLive] = useState<Mark | null>(null);
  /** Drawings the gumka went over in the gesture under way (removed when the finger lifts). */
  const [erased, setErased] = useState<string[]>([]);

  /** Pointer position as fractions of the page. */
  const frac = (e: { clientX: number; clientY: number }, layer: HTMLElement) => {
    // the drawn size of the layer (it is bigger on screen when the page is zoomed in)
    const b = layer.getBoundingClientRect();
    return { x: (e.clientX - b.left) / (b.width || rect.width), y: (e.clientY - b.top) / (b.height || rect.height) };
  };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot((b.x - a.x) * rect.width, (b.y - a.y) * rect.height);

  const follow = (el: HTMLElement, pointerId: number, move: (e: PointerEvent) => void, up: (e: PointerEvent) => void) => {
    try {
      el.setPointerCapture?.(pointerId);
    } catch {
      // a pointer the browser no longer tracks: follow it without capture
    }
    const off = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', cancel);
    };
    const end = (e: PointerEvent) => {
      off();
      up(e);
    };
    // a second finger (pinch zoom) or the browser took the pointer: nothing is made
    const cancel = () => {
      off();
      setLive(null);
      setErased([]);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', cancel);
  };

  /** A finger on an empty part of the page: place, draw or cover, depending on the tool. */
  const onLayerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editing || e.target !== e.currentTarget) return;
    // a touch outside the selected item hides its handles; new items come without them
    onSelect(null);
    if (!tool || tool === 'crop') return;
    e.preventDefault();
    const layer = e.currentTarget;
    const a = frac(e, layer);
    const id = crypto.randomUUID();

    if (isPlaceTool(tool)) {
      let far = false;
      follow(
        layer,
        e.pointerId,
        (ev) => {
          if (dist(a, frac(ev, layer)) > 10) far = true;
        },
        () => {
          if (!far) onPlace(tool, a);
        },
      );
      return;
    }

    if (tool === 'eraser') {
      const aspect = rect.height / rect.width;
      const hit = new Set<string>();
      const rub = (p: { x: number; y: number }) => {
        let more = false;
        for (const m of page.marks ?? []) {
          if (!hit.has(m.id) && erases(m, p.x, p.y, aspect)) {
            hit.add(m.id);
            more = true;
          }
        }
        if (more) setErased([...hit]);
      };
      rub(a);
      follow(
        layer,
        e.pointerId,
        (ev) => rub(frac(ev, layer)),
        () => {
          setErased([]);
          removeMarks(page.id, [...hit]); // one undo step for the whole rub
        },
      );
      return;
    }

    if (tool === 'pen' || tool === 'highlight') {
      const points = [clamp01(a.x), clamp01(a.y)];
      const make = (): Mark =>
        tool === 'pen'
          ? { id, kind: 'pen', color: ink, points: [...points], ...(penWidth !== 1 ? { width: penWidth } : {}) }
          : { id, kind: 'highlight', color: highlight, points: [...points] };
      setLive(make());
      follow(
        layer,
        e.pointerId,
        (ev) => {
          const b = frac(ev, layer);
          points.push(clamp01(b.x), clamp01(b.y));
          setLive(make());
        },
        () => {
          setLive(null);
          const m = make() as Extract<Mark, { points: number[] }>;
          addMark(page.id, { ...m, points: simplify(m.points, 0.0015) });
        },
      );
      return;
    }

    // Zasłoń, Strzałka, Prostokąt, Kółko: a drag from corner to corner (arrow: from start to tip)
    let b = a;
    const shape = (): Mark => {
      if (tool === 'arrow') return { id, kind: 'arrow', color: ink, x: a.x, y: a.y, w: clamp01(b.x) - a.x, h: clamp01(b.y) - a.y };
      const x = clamp01(Math.min(a.x, b.x));
      const y = clamp01(Math.min(a.y, b.y));
      const box = { x, y, w: clamp01(Math.max(a.x, b.x)) - x, h: clamp01(Math.max(a.y, b.y)) - y };
      return tool === 'cover'
        ? { id, kind: 'cover', color: coverColor, ...box }
        : { id, kind: tool as 'rect' | 'ellipse', color: ink, ...box };
    };
    follow(
      layer,
      e.pointerId,
      (ev) => {
        b = frac(ev, layer);
        setLive(shape());
      },
      () => {
        setLive(null);
        const small = dist(a, b) < 12;
        if (tool === 'cover' && small) {
          // a tap: a ready-made box around the finger
          const box = { x: clamp01(a.x - TAP_BOX.w / 2), y: clamp01(a.y - TAP_BOX.h / 2), w: TAP_BOX.w, h: TAP_BOX.h };
          addMark(page.id, {
            id,
            kind: 'cover',
            color: coverColor,
            x: Math.min(box.x, 1 - box.w),
            y: Math.min(box.y, 1 - box.h),
            w: box.w,
            h: box.h,
          });
        } else if (small) {
          return; // a tap with an arrow or a shape draws nothing
        } else {
          const m = shape();
          addMark(page.id, tool === 'cover' && hasBox(m) ? { ...m, w: Math.max(m.w, MIN), h: Math.max(m.h, MIN) } : m);
        }
      },
    );
  };

  /** Moving (middle), resizing (corner) or bending an arrow (its ends): one undo step per drag. */
  const onItemDown = (m: Mark, handle: Handle) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();
    const wasSelected = m.id === selectedId;
    onSelect(m.id);
    const layer = e.currentTarget.closest('.mark-layer') as HTMLElement;
    const a = frac(e, layer);
    // text and ticks keep their shape when resized (the text grows with the box height)
    const keepShape = (m.kind === 'text' || m.kind === 'check' || m.kind === 'cross') && handle !== 'move';
    let next: Mark = m;
    let far = false;
    follow(
      e.currentTarget,
      e.pointerId,
      (ev) => {
        const b = frac(ev, layer);
        if (dist(a, b) > 6) far = true;
        if (!far) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (handle === 'move') next = moved(m, dx, dy);
        else if (m.kind === 'arrow' && handle === 'start') next = { ...m, x: m.x + dx, y: m.y + dy, w: m.w - dx, h: m.h - dy };
        else if (m.kind === 'arrow' && handle === 'end') next = { ...m, w: m.w + dx, h: m.h + dy };
        else if (hasBox(m) && handle !== 'start' && handle !== 'end') {
          let box = dragCrop(m, handle, dx, dy, 1, 1, MIN);
          if (keepShape) {
            const w = Math.min(1 - box.x, m.w * (box.h / m.h));
            box = { ...box, w, x: handle === 'nw' || handle === 'sw' ? m.x + m.w - w : box.x };
          }
          next = { ...m, ...box } as Mark;
        }
        setLive(next);
      },
      () => {
        setLive(null);
        if (far && next !== m) {
          const { id: _id, kind: _kind, ...patch } = next as Mark & Record<string, unknown>;
          updateMark(page.id, m.id, patch);
        } else if (!far && wasSelected && handle === 'move' && m.kind === 'text') onEditText(m);
      },
    );
  };

  const marks = (page.marks ?? []).filter((m) => !erased.includes(m.id));
  const shown = live ? (marks.some((m) => m.id === live.id) ? marks.map((m) => (m.id === live.id ? live : m)) : [...marks, live]) : marks;
  const pct = (v: number) => `${v * 100}%`;
  const chosen = marks.find((m) => m.id === selectedId);
  const drawing = editing && tool !== null && tool !== 'crop';

  return (
    <div
      className={drawing ? 'mark-layer drawing' : editing ? 'mark-layer editing' : 'mark-layer'}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      onPointerDown={onLayerDown}
    >
      <Marks marks={shown} pageW={rect.width} pageH={rect.height} />
      {editing &&
        shown.map((m) => {
          const b = hitBox(m);
          const selected = m.id === selectedId;
          const ends = m.kind === 'arrow';
          const corners = hasBox(m) && !ends;
          return (
            <div
              key={m.id}
              data-mark={m.id}
              className={`mark-item${selected ? ' selected' : ''}${b.w * rect.width < SMALL_PX || b.h * rect.height < SMALL_PX ? ' small' : ''}`}
              style={{ left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) }}
              onPointerDown={onItemDown(m, 'move')}
            >
              {selected && (
                <>
                  {corners &&
                    CORNERS.map((c) => <span key={c} className={`mark-handle ${c}`} aria-hidden="true" onPointerDown={onItemDown(m, c)} />)}
                  {ends &&
                    (['start', 'end'] as const).map((h) => {
                      const px = h === 'start' ? m.x : m.x + m.w;
                      const py = h === 'start' ? m.y : m.y + m.h;
                      return (
                        <span
                          key={h}
                          className="mark-handle end"
                          data-handle={h}
                          aria-hidden="true"
                          style={{ left: pct((px - b.x) / b.w), top: pct((py - b.y) / b.h) }}
                          onPointerDown={onItemDown(m, h)}
                        />
                      );
                    })}
                </>
              )}
            </div>
          );
        })}
      {editing && bubble && chosen && !live && (
        <BubbleAnchor
          at={bubblePlace(
            hitBox(chosen),
            rect,
            zoom,
            hitBox(chosen).w * rect.width < SMALL_PX || hitBox(chosen).h * rect.height < SMALL_PX ? BUBBLE_GAP.small : BUBBLE_GAP.mark,
          )}
          zoom={zoom}
          host={bubbleHost}
          shift={bubbleHost ? { x: rect.left, y: rect.top } : undefined}
        >
          {bubble(chosen)}
        </BubbleAnchor>
      )}
    </div>
  );
}
