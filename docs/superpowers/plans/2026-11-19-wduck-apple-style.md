# WDuck Apple-style Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole WDuck UI in an iOS look (chosen option "C · Jak aplikacje Apple") and fix the phone layout: one-row top bar, big bottom "Zapisz PDF" bar, while keeping the page grid layout and all behaviour.

**Architecture:** Plain CSS with design tokens in `src/ui/app.css` (`:root` custom properties) plus markup changes in the existing React components. The review toolbar is split into a top bar (`Toolbar`) and a bottom action bar (`ActionBar`), with a `MoreMenu` (⋯) holding rarer actions. Icons are small inline SVG components in `src/ui/icons.tsx`. No new dependencies.

**Tech Stack:** React 18, TypeScript, Vite 8, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-19-wduck-apple-style-design.md`

## Global Constraints

- Page grid layout stays: order, "+" insert buttons between pages, "Dodaj strony" cell, drag-and-drop. Style only.
- No behaviour change in store/analysis/export/session. `src/ui/store.ts` is not modified except where a task says so.
- No new npm dependencies. No dark mode.
- All UI text Polish, in `src/ui/strings.ts`. Icon-only buttons have `aria-label` (and `title`) from strings.
- Tokens: font `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`; `--bg: #f2f2f7`; `--card: #ffffff`; `--accent: #0a84ff`; `--flag: #ff9f0a`; `--danger: #ff3b30`; `--text: #1c1c1e`; `--text-2: #6e6e73`; `--sep: #e5e5ea`; radii 10–14 px; soft shadows.
- Phone target 375×812, tablet 768×1024, desktop. Bottom bar respects `env(safe-area-inset-bottom)`; grid gets bottom padding so the last row is never hidden behind it.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. At 375 px with "12 stron do sprawdzenia" the top bar stays one row (capsule text truncates with ellipsis, icons never wrap). Controller checks in browser.
2. iPhone bottom: the save bar sits above the home indicator, and the last grid row and "Dodaj strony" are reachable above the bar. Controller checks in browser.
3. The ⋯ menu closes after choosing an item, on outside tap, and on Escape (Task 2 test).
4. Long notice/error text (long file names) wraps inside its card, without horizontal scroll. Controller checks in browser.
5. Drag-and-drop and tapping thumbs still work. The bottom bar must not cover thumbs in a way that captures touches (existing ReviewGrid tests, plus a controller check).

---

### Task 1: Theme tokens, Home screen, banners and secondary screens

**Files:**
- Modify: `src/ui/app.css` (tokens on `:root`, base, buttons, home, banners `.error-banner`/`.notice-banner`, `.update-prompt`, `.settings-panel`, `.diag`)
- Modify: `src/ui/Home.tsx`, `src/ui/strings.ts`
- Test: `tests/ui/home.test.tsx` (create)

**Interfaces:**
- Produces: CSS tokens listed in Global Constraints, button classes `.btn`, `.btn-primary` (filled accent), `.btn-plain` (accent text, no background), `.btn-danger`, `.btn-icon` (36×36 round-rect icon button), `.btn-huge`. Task 2 uses them.
- New strings: `appDescription: 'Obraca i prostuje skany PDF. Wszystko zostaje na Twoim urządzeniu.'`, `steps: ['1. Otwórz', '2. Sprawdź', '3. Zapisz']`.

- [ ] **Step 1: Write failing tests** in `tests/ui/home.test.tsx`: render `<App store={createAppStore(fakeDeps())} />` and assert:
  - `screen.getByText('Obraca i prostuje skany PDF. Wszystko zostaje na Twoim urządzeniu.')` exists
  - `screen.getByText('1. Otwórz')`, `'2. Sprawdź'`, `'3. Zapisz'` exist
  - `document.querySelector('img.home-icon')?.getAttribute('src')` ends with `icons/icon-192.png` (use `import.meta.env.BASE_URL + 'icons/icon-192.png'`)
  - heading `strings.appName` and button `strings.open` still exist
- [ ] **Step 2: Run** `npx vitest run tests/ui/home.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Home: rounded-square app icon (`img.home-icon`, alt ""), title (keep the 5-tap secret on the heading), subtitle, big primary button (or the restore pair: primary "Wróć do ostatniego dokumentu" + plain "Zacznij od nowa"), steps row as small grey capsules, ⚙ settings stays top-right as `.btn-icon`. Restyle per spec: banners as rounded cards under the bar (error red tint, notice green tint), update prompt as a floating card at the bottom above the safe area, settings popover as an iOS-style card, diagnostics header in the same top-bar style.
- [ ] **Step 4: Run** the full suite (`npx vitest run`) and `npx tsc --noEmit`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(ui): iOS-style theme, home screen and banners`.

### Task 2: Review screen: one-row top bar, ⋯ menu, bottom action bar, thumbnails

**Files:**
- Create: `src/ui/icons.tsx`, `src/ui/ActionBar.tsx`, `src/ui/MoreMenu.tsx`
- Modify: `src/ui/Toolbar.tsx`, `src/ui/App.tsx` (render `<ActionBar />` in the review screen), `src/ui/app.css` (toolbar, action bar, thumbs, grid, progress), `src/ui/strings.ts`, `src/ui/PageThumb.tsx` / `src/ui/ReviewGrid.tsx` (class names only if needed)
- Test: `tests/ui/ReviewGrid.test.tsx` (update + add)

**Interfaces:**
- Consumes: Task 1 tokens and button classes; existing store API (`undo`, `redo`, `toggleSelecting`, `setFilterFlagged`, `rotate`, `remove`, `export`, `shareExport`, `openDiagnostics`, `setDeskew`, `goHome`).
- Produces: `icons.tsx` exports `IconClose`, `IconUndo`, `IconRedo`, `IconMore`, `IconGear` (`(props: { size?: number }) => JSX.Element`, `aria-hidden` SVG, `currentColor`). `ActionBar()` and `MoreMenu()` React components without props (they read `useAppStore()`).
- New strings: `more: 'Więcej'`, `diagnostics: 'Diagnostyka'`.

Layout decisions:
- **Top bar (normal mode):** `IconClose` button (aria-label `strings.close`, same confirm as today) · filter capsule · spacer · undo (aria-label `strings.undo`) · redo (aria-label `strings.redo`) · `MoreMenu` (aria-label `strings.more`). Frosted: `background: rgba(255,255,255,.8); backdrop-filter: blur(20px)`, single row, `flex-wrap: nowrap`.
- **Filter capsule:** visible text `strings.toCheck(n)` (orange tint when n > 0). When `n > 0 || filterFlagged` it is a `<button aria-pressed={filterFlagged} aria-label={strings.showOnlyFlagged}>` that toggles the filter (filled orange when pressed). Otherwise a plain `<span>`. Text truncates with ellipsis. The 5-tap diagnostics secret moves off the capsule; the ⋯ menu gets a "Diagnostyka" item instead (Home keeps its title secret).
- **⋯ menu:** popover card with items: "Zaznacz" (`strings.select`, calls `toggleSelecting`), the deskew switch row (`<input type="checkbox">` labelled `strings.deskew`, plus `strings.deskewHint`), "Diagnostyka" (`openDiagnostics`). It closes after an item, on outside pointerdown, and on Escape. The deskew switch does not close it.
- **Top bar (selection mode):** "Gotowe" (`strings.selectDone`, plain accent) · `strings.selectedCount(n)` · spacer.
- **ActionBar (bottom, fixed, safe-area padding, frosted):** normal mode: one full-width primary button with today's labels/states (`strings.save` / `strings.saving` / `strings.savingProgress` / iOS `strings.shareExport`), same disabled rules as today's toolbar save button. Selection mode: two buttons side by side, "Obróć" (`strings.rotate`) and "Usuń" (`strings.remove`, danger), disabled when n = 0.
- **Thumbnails/grid:** white card with soft shadow and 8 px radius; number in a dark translucent capsule; auto-rotate badge as a blue circle; flagged = orange outline + orange label; selected check as blue circle. Smaller gaps and lighter "+" (accent colour, thin, ≥ 28 px tap target) so thumbs are larger on phone. The grid gets `padding-bottom: calc(88px + env(safe-area-inset-bottom))`. Progress bar: thin accent line under the top bar with small grey text.

- [ ] **Step 1: Update existing tests** in `tests/ui/ReviewGrid.test.tsx` that click `strings.select` or `strings.settings` on the review screen: open the menu first with `fireEvent.click(screen.getByRole('button', { name: strings.more }))`. Tests that click `strings.showOnlyFlagged`, `strings.undo`, `strings.redo`, `strings.save`, `strings.rotate`, `strings.remove`, 'Udostępnij / Zapisz' keep their queries (accessible names are unchanged).
- [ ] **Step 2: Add failing tests:**
  - `'⋯ menu holds Zaznacz, deskew and Diagnostyka and closes after choosing'`: click `strings.more`, then `getByRole('button', { name: strings.select })`, `getByRole('checkbox', { name: strings.deskew })`, `getByRole('button', { name: strings.diagnostics })` exist; click Zaznacz → `getByText(strings.selectedCount(0))` exists and `queryByRole('checkbox', { name: strings.deskew })` is null.
  - `'⋯ menu closes on Escape and on outside tap'`: open, `fireEvent.keyDown(document, { key: 'Escape' })` → checkbox gone; open again, `fireEvent.pointerDown(document.body)` → checkbox gone.
  - `'filter capsule shows the count and toggles the filter'`: with 3 flagged pages `getByText('3 strony do sprawdzenia')`; the button named `strings.showOnlyFlagged` has `aria-pressed="false"`, after a click `"true"`.
  - `'save lives in the bottom action bar; selection actions replace it'`: `screen.getByRole('button', { name: strings.save }).closest('.action-bar')` is not null; after menu → Zaznacz, buttons `strings.rotate` and `strings.remove` are inside `.action-bar` and `strings.save` is absent.
- [ ] **Step 3: Run** `npx vitest run tests/ui/ReviewGrid.test.tsx`. Expected: the new tests FAIL.
- [ ] **Step 4: Implement** per the layout decisions above.
- [ ] **Step 5: Run** the full suite, `npx tsc --noEmit` and `npm run build`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(ui): one-row top bar, more menu, bottom action bar, iOS-style thumbnails`.
