# Page Preview (hold and release) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full-screen page preview opened by hold-and-release on a thumbnail (touch) or a ~500 ms mouse hold, with ‹ › navigation, "Obróć", ✕, Escape and native pinch zoom.

**Architecture:** The store gets `previewId` with `openPreview` and `closePreview`. `ReviewGrid` opens the preview from dnd-kit's `onDragEnd` when the drop target is the page itself and the drag delta is under 10 px. `PageThumb` adds a mouse-only hold timer. The new `PagePreview` overlay renders the raw page with `renderPage` at high resolution and rotates it with CSS, the same way the thumbnail does.

**Tech Stack:** React 18, TS, @dnd-kit/core + sortable, pdf.js render via `src/imaging/render.ts`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-19-page-preview-design.md`

## Global Constraints

- A short tap still rotates 90° (`rotate([id], 90)`), and opening the preview must NOT also rotate. Suppress the click that follows a hold.
- Touch drag activation stays `{ delay: 250, tolerance: 8 }`, mouse stays `{ distance: 8 }`. Reordering still works.
- No preview in selection mode.
- Polish strings in `src/ui/strings.ts`, iOS look (tokens from `src/ui/app.css`), icon buttons with `aria-label`, and tap targets of at least 44 px.
- iOS memory: release the render canvas (`releaseCanvas`) right after it becomes an image, and revoke object URLs on page change or close.
- Do not block pinch zoom (no `maximum-scale`/`user-scalable=no`; the overlay uses `touch-action` that allows pinch).
- No new dependencies. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Hold and release on touch opens the preview and does not rotate the page. The controller checks this in the browser with touch emulation; the unit test covers the click suppression.
2. Hold and move still reorders and never opens the preview (unit test on `onDragEnd` logic).
3. Flipping quickly through 100 pages leaks no canvases or URLs, and a late render for a page the user already left is discarded (unit test with a deferred render).
4. A page with `baseRotation` 90 and user rotation 90 is shown at 180° in the preview, the same angle as its thumbnail.
5. With "Pokaż tylko te" on, ‹ › move only through the visible pages, and the arrows are disabled at the ends.

---

### Task 1: Page preview

**Files:**
- Create: `src/ui/PagePreview.tsx`, `tests/ui/PagePreview.test.tsx`
- Modify: `src/ui/store.ts` (state `previewId: string | null`, actions `openPreview(id: string): void`, `closePreview(): void`; `goHome`/`load` reset it, and `remove` closes it if the previewed page was removed), `src/ui/ReviewGrid.tsx` (`onDragEnd` opens the preview; a `onPreview` stable callback passed to thumbs; visible page id list passed to the preview), `src/ui/PageThumb.tsx` (mouse hold timer + click suppression), `src/ui/App.tsx` (render `<PagePreview />` in the review screen), `src/ui/app.css`, `src/ui/strings.ts`

**Interfaces:**
- `PagePreview(props: { pageIds: string[] })`: reads `previewId`, `doc`, `sources`, `rotate` and `closePreview` from `useAppStore()`, and returns null when `previewId` is null or not in `pageIds`.
- Render dependency: `renderPage(source, ref, maxSide)` and `releaseCanvas(canvas)` from `src/imaging/render.ts`. Make it injectable for tests through an optional prop `render?: typeof renderPage` (default `renderPage`).
- Rotation shown: `effectiveRotation(page) + page.skewDeg` (from `src/model/document.ts`), as in PageThumb.
- New strings: `preview: (n: number) => \`Podgląd: strona ${n}\``, `previousPage: 'Poprzednia strona'`, `nextPage: 'Następna strona'`. Reuse `strings.close`, `strings.rotate`, `strings.page`.

- [ ] **Step 1: Write failing tests** in `tests/ui/PagePreview.test.tsx` (render `<App store=…>` with `fakeDeps`, `docWithFlags`/fixtures; inject a fake render through the store's review screen, or test `PagePreview` directly with a provider):
  - `'drag end on the same page with a small delta opens the preview; a real move reorders'`: test the exported pure helper `isHoldRelease(activeId, overId, delta): boolean` from `ReviewGrid.tsx`. `('p1','p1',{x:3,y:-4})` → true, `('p1','p1',{x:12,y:0})` → false, `('p1','p2',{x:1,y:1})` → false.
  - `'preview shows the page number, rotates through history and closes on ✕ and Escape'`: `store.openPreview('p2')` → `getByRole('dialog', { name: 'Podgląd: strona 2' })`. Click `strings.rotate` → page p2's rotation increased by 90, and `store.undo()` restores it. Click `strings.close` → dialog gone. Open again, `keyDown(document, {key:'Escape'})` → gone.
  - `'‹ › walk the visible pages and are disabled at the ends'`: with `pageIds=['p1','p3']` and previewing p1, `strings.previousPage` is disabled. Click `strings.nextPage` → dialog name `'Podgląd: strona 3'` (its number in the whole document), and `nextPage` is now disabled. `ArrowLeft` goes back.
  - `'the preview image uses the thumbnail angle'`: a page with `baseRotation: 90, rotation: 90` → the preview image's style transform contains `rotate(180deg)`.
  - `'a late render for a page already left is discarded and canvases are released'`: use a deferred fake render. Open p1, navigate to p2, then resolve p1's render → the shown image is not p1's. The `releaseCanvas` spy (or `canvas.width === 0`) holds for both canvases.
  - `'opening the preview from a hold does not rotate the page'`: in `PageThumb`, simulate a mouse hold: `pointerDown` with `pointerType:'mouse'`, advance fake timers 500 ms → `openPreview` called. Then `pointerUp` + `click` → `rotate` NOT called. A quick `pointerDown`/`pointerUp`/`click` → `rotate` called once.
- [ ] **Step 2: Run** `npx vitest run tests/ui/PagePreview.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Overlay: fixed full screen, dark translucent backdrop (`rgba(0,0,0,.92)`), safe-area aware top bar (✕ left, "Strona N" centre, "Obróć" right). The image is centred, `object-fit: contain`, rotated by CSS. For 90° and 270° swap the fit box so the rotated page still fits the screen. ‹ › buttons sit at the left and right edges, vertically centred, 44 px. Show the cached thumbnail while the full render loads. The overlay container uses `touch-action: pan-x pan-y pinch-zoom`.
  - Touch: in `onDragEnd`, `if (isHoldRelease(active.id, over?.id, delta)) openPreview(id)`. Make sure the click that follows the touchend does not rotate: suppress clicks on that thumb for ~400 ms after a preview opens (shared flag/ref in ReviewGrid passed to `onTap`).
  - Mouse: in PageThumb, on `pointerdown` with `pointerType === 'mouse'` and button 0, start a 500 ms timer. Cancel it on pointerup, pointerleave, or pointermove > 8 px. When it fires call `onPreview(page.id)` and swallow the next click.
- [ ] **Step 4: Run** the full suite, `npx tsc --noEmit` and `npm run build`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(ui): page preview on hold and release`.
