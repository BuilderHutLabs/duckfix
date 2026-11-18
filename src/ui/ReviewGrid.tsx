import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { isFlagged, useAppStore } from './store';
import { createThumbnailCache } from './thumbnails';
import { PageThumb } from './PageThumb';
import { FILE_ACCEPT } from './Home';
import { strings } from './strings';

// dnd-kit turns a boolean `disabled` into a new object on every render, which changes the
// SortableContext value and re-renders every thumb; a constant object keeps it stable.
const SORTING_ENABLED = { draggable: false, droppable: false };
// Module constants for the same reason: new option objects would rebuild the sensors each render.
const MOUSE_OPTIONS = { activationConstraint: { distance: 8 } };
// long press (250 ms) starts a drag; a quick tap stays a click
const TOUCH_OPTIONS = { activationConstraint: { delay: 250, tolerance: 8 } };

export function ReviewGrid() {
  const s = useAppStore();
  const [cache] = useState(() => createThumbnailCache());
  const input = useRef<HTMLInputElement>(null);
  const insertIndex = useRef(0);

  useEffect(() => () => cache.clear(), [cache]);
  useEffect(() => cache.retain(new Set(s.doc.pages.map((p) => p.id))), [cache, s.doc]);

  const sensors = useSensors(useSensor(MouseSensor, MOUSE_OPTIONS), useSensor(TouchSensor, TOUCH_OPTIONS));

  // Pages flagged when the filter was switched on stay visible after a tap clears their flag,
  // so the user can keep turning them until they look right.
  const [pinned, setPinned] = useState({ on: false, ids: new Set<string>() });
  if (pinned.on !== s.filterFlagged) {
    setPinned({ on: s.filterFlagged, ids: new Set(s.doc.pages.filter(isFlagged).map((p) => p.id)) });
  }
  const flaggedCount = s.doc.pages.filter(isFlagged).length;
  const all = s.doc.pages.map((page, index) => ({ page, index }));
  const visible = s.filterFlagged
    ? all.filter(({ page }) => isFlagged(page) || pinned.ids.has(page.id))
    : all;
  const visibleKey = visible.map(({ page }) => page.id).join('|');
  // Stable array identity: a new one would re-render every sortable thumb.
  const items = useMemo(() => (visibleKey ? visibleKey.split('|') : []), [visibleKey]);

  // Stable callbacks (read the latest store through a ref) so React.memo can skip unchanged thumbs.
  const latest = useRef(s);
  latest.current = s;
  const onTap = useCallback((id: string) => {
    const st = latest.current;
    if (st.selecting) st.toggleSelected(id);
    else st.rotate([id], 90);
  }, []);
  const pickFiles = useCallback((index: number) => {
    insertIndex.current = index;
    input.current?.click();
  }, []);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) s.moveById(String(active.id), String(over.id));
  };

  return (
    <main className="grid-wrap">
      {s.doc.pages.length === 0 && <p className="grid-note">{strings.emptyDoc}</p>}
      {s.filterFlagged && flaggedCount === 0 && s.doc.pages.length > 0 && (
        <p className="grid-note">{strings.nothingFlagged}</p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items} strategy={rectSortingStrategy} disabled={SORTING_ENABLED}>
          <div className="grid">
            {visible.map(({ page, index }) => (
              <PageThumb
                key={page.id}
                page={page}
                index={index}
                source={s.getSource(page.source.fileId)}
                cache={cache}
                selecting={s.selecting}
                selected={s.selection.has(page.id)}
                onTap={onTap}
                onInsertBefore={s.selecting ? undefined : pickFiles}
              />
            ))}
            {!s.selecting && (
              <button
                type="button"
                className="add-cell"
                disabled={s.busy === 'opening'}
                onClick={() => pickFiles(s.doc.pages.length)}
              >
                <span className="add-plus" aria-hidden="true">
                  +
                </span>
                {s.busy === 'opening' ? strings.opening : strings.addAtEnd}
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        multiple
        accept={FILE_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void s.insertAt(insertIndex.current, files);
        }}
      />
    </main>
  );
}
