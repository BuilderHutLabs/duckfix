import { useEffect, useRef, useState } from 'react';
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

export function ReviewGrid() {
  const s = useAppStore();
  const [cache] = useState(() => createThumbnailCache());
  const input = useRef<HTMLInputElement>(null);
  const insertIndex = useRef(0);

  useEffect(() => () => cache.clear(), [cache]);
  useEffect(() => cache.retain(new Set(s.doc.pages.map((p) => p.id))), [cache, s.doc]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // long press (250 ms) starts a drag; a quick tap stays a click
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const all = s.doc.pages.map((page, index) => ({ page, index }));
  const visible = s.filterFlagged ? all.filter(({ page }) => isFlagged(page)) : all;

  const pickFiles = (index: number) => {
    insertIndex.current = index;
    input.current?.click();
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) s.moveById(String(active.id), String(over.id));
  };

  return (
    <main className="grid-wrap">
      {s.doc.pages.length === 0 && <p className="grid-note">{strings.emptyDoc}</p>}
      {s.filterFlagged && visible.length === 0 && s.doc.pages.length > 0 && (
        <p className="grid-note">{strings.nothingFlagged}</p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map(({ page }) => page.id)} strategy={rectSortingStrategy}>
          <div className="grid">
            {visible.map(({ page, index }) => (
              <PageThumb
                key={page.id}
                page={page}
                number={index + 1}
                source={s.getSource(page.source.fileId)}
                cache={cache}
                selecting={s.selecting}
                selected={s.selection.has(page.id)}
                onTap={() => (s.selecting ? s.toggleSelected(page.id) : s.rotate([page.id], 90))}
                onInsertBefore={s.selecting ? undefined : () => pickFiles(index)}
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
