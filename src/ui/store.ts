import { storageKey } from '../config';
import { currentLanguage, formatSize, type Lang } from '../i18n';
import { createOcrEngine, type OcrEngine } from '../export/ocr';
import { loadExportOptions, saveExportOptions, type ExportOptions } from '../export/options';
import { createContext, createElement, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import {
  applyAnalysis,
  deletePages,
  insertPages,
  movePage,
  rotatePages,
  type Doc,
  type Page,
} from '../model/document';
import { createHistory, type History } from '../model/history';
import { importFiles, type SourceFile } from '../import/importFiles';
import { ImportError } from '../import/errors';
import { forgetPdf, releaseCanvas, renderPage } from '../imaging/render';
import { ANALYSIS_MAX_SIDE, analyzePages, canvasToGrayImage, type PageAnalysis } from '../pipeline/analyze';
import { createTesseractDetector, tesseractPaths } from '../orientation/tesseract';
import type { OrientationDetector } from '../orientation/detector';
import { DEFAULT_THRESHOLDS } from '../orientation/policy';
import { exportFileName, exportPdf } from '../export/exportPdf';
import { browserRasterizer } from '../export/rasterize';
import { downloadFile, pdfFile, prefersShareSheet, shareOrDownload } from '../export/share';
import { createMetrics } from '../diagnostics/metrics';
import { indexedDbSession, type SessionStorage, type StoredSession } from '../storage/session';
import { strings } from './strings';

export type Phase = 'home' | 'analyzing' | 'review';

export interface AppState {
  phase: Phase;
  doc: Doc;
  sources: Map<string, SourceFile>;
  progress: { done: number; total: number };
  selection: Set<string>;
  selecting: boolean;
  filterFlagged: boolean;
  /** Page shown in the full-screen preview. */
  previewId: string | null;
  canUndo: boolean;
  canRedo: boolean;
  busy: 'opening' | 'exporting' | null;
  /** Pages written so far while exporting. */
  exportProgress: { done: number; total: number; ocr: boolean } | null;
  /** Exported PDF waiting for the user's tap on "Udostępnij / Zapisz". */
  exportReady: File | null;
  /** "Zapisz PDF" opened the save options sheet. */
  saveSheetOpen: boolean;
  /** Last choices in the save sheet (remembered). */
  exportOptions: ExportOptions;
  error: string | null;
  /** Short confirmation, e.g. where the saved file went. */
  notice: string | null;
  deskew: boolean;
  /** A document from an earlier visit is stored and can be restored (shown on Home). */
  restorable: boolean;
  diagnostics: boolean;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface StoreDeps {
  importFiles(files: File[]): Promise<{ sources: SourceFile[]; pages: Page[] }>;
  analyzePages: typeof analyzePages;
  createDetector(): Promise<OrientationDetector>;
  exportPdf(
    doc: Doc,
    sources: Map<string, SourceFile>,
    onProgress: (done: number, total: number) => void,
    opts: { compress: boolean; ocr: OcrEngine | null; signal: AbortSignal },
  ): Promise<Uint8Array>;
  /** OCR engine for "Tekst do wyszukiwania" in the given language (may download deu/spa data). */
  createOcr(lang: Lang): Promise<OcrEngine>;
  share: typeof shareOrDownload;
  /** Plain download of the exported file (Windows, Android, Mac). */
  download(file: File): void;
  /** iPhone/iPad: save through the share sheet on a separate tap instead of a download. */
  shareFirst: boolean;
  forgetPdf(fileId: string): Promise<void>;
  storage: StorageLike | null;
  session: SessionStorage | null;
}

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserDeps(): StoreDeps {
  return {
    importFiles,
    analyzePages,
    createDetector: () => createTesseractDetector({ basePath: import.meta.env.BASE_URL, workers: 2 }),
    exportPdf: (doc, sources, onProgress, opts) =>
      exportPdf(doc, sources, browserRasterizer, onProgress, {
        compress: opts.compress,
        ocr: opts.ocr ?? undefined,
        signal: opts.signal,
      }),
    createOcr: (lang) => createOcrEngine(lang, tesseractPaths(import.meta.env.BASE_URL)),
    share: shareOrDownload,
    download: downloadFile,
    shareFirst: prefersShareSheet(),
    forgetPdf,
    storage: browserStorage(),
    session: indexedDbSession,
  };
}

const DESKEW_KEY = storageKey('wduck.deskew');
const ANALYZE = { concurrency: 2, maxSide: ANALYSIS_MAX_SIDE } as const;
const SAVE_DOC_DELAY_MS = 500;
/** While changes keep coming (analysis progress), the doc is still saved at least this often. */
const SAVE_DOC_MAX_WAIT_MS = 2500;

/**
 * Applies an analysis result to one history state. Unanalyzed pages start at rotation 0 and only
 * user actions change it, so a non-zero rotation means the user already turned the page: keep it
 * and drop 'check-orientation' (the user's tap settled it), but still record
 * autoRotation/skew/other flags/analyzed.
 */
export function mergeAnalysis(doc: Doc, a: PageAnalysis): Doc {
  const page = doc.pages.find((p) => p.id === a.pageId);
  if (!page || page.analyzed) return doc;
  const userRotated = page.rotation !== 0;
  const next = applyAnalysis(doc, a.pageId, a);
  if (!userRotated) return next;
  return {
    pages: next.pages.map((p) =>
      p.id === a.pageId
        ? { ...p, rotation: page.rotation, flags: p.flags.filter((f) => f !== 'check-orientation') }
        : p,
    ),
  };
}

function errorMessage(e: unknown): string {
  return e instanceof ImportError ? strings.errors[e.code] : strings.genericError;
}

/** One opened document; replaced on open/goHome so late async work can tell it is stale. */
interface Session {
  controller: AbortController;
  runs: number;
}

export function createAppStore(overrides: Partial<StoreDeps> = {}) {
  const deps: StoreDeps = { ...browserDeps(), ...overrides };
  const listeners = new Set<() => void>();
  let history: History<Doc> = createHistory<Doc>({ pages: [] });
  let session: Session = { controller: new AbortController(), runs: 0 };
  let detector: Promise<OrientationDetector> | null = null;
  let metrics = createMetrics();
  /** Session found in storage at startup, until restored or discarded. */
  let stored: StoredSession | null = null;
  /** Set once storage was cleared/overwritten: a startup load still in flight is stale then. */
  let storedReplaced = false;
  /** Last doc handed to session storage, and the pending debounced save. */
  let persistedDoc: Doc = history.present;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** The doc `state.exportReady` was built from; any other doc makes the file stale. */
  let exportedDoc: Doc | null = null;
  /** Aborts the running export ("Anuluj"). */
  let exportCtrl: AbortController | null = null;
  /** OCR engine, created on the first searchable export and kept for the open document. */
  let ocr: { lang: Lang; engine: Promise<OcrEngine> } | null = null;
  const disposeOcr = () => {
    const old = ocr;
    ocr = null;
    void old?.engine.then((e) => e.dispose()).catch(() => {});
  };
  const getOcr = (): Promise<OcrEngine> => {
    const lang = currentLanguage();
    if (ocr?.lang !== lang) {
      disposeOcr();
      const engine = deps.createOcr(lang);
      // a failed start (offline, first deu/spa download) is retried on the next export
      engine.catch(() => {
        if (ocr?.engine === engine) ocr = null;
      });
      ocr = { lang, engine };
    }
    return ocr.engine;
  };
  /** When the oldest unsaved change was scheduled (start of the max-wait window). */
  let savePendingSince: number | null = null;

  const readDeskew = (): boolean => {
    try {
      return deps.storage?.getItem(DESKEW_KEY) !== '0';
    } catch {
      return true;
    }
  };

  let state: AppState = {
    phase: 'home',
    doc: history.present,
    sources: new Map(),
    progress: { done: 0, total: 0 },
    selection: new Set(),
    selecting: false,
    filterFlagged: false,
    previewId: null,
    canUndo: false,
    canRedo: false,
    busy: null,
    exportProgress: null,
    exportReady: null,
    saveSheetOpen: false,
    exportOptions: loadExportOptions(deps.storage),
    notice: null,
    error: null,
    deskew: readDeskew(),
    restorable: false,
    diagnostics: false,
  };

  const cancelDocSave = () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = null;
    savePendingSince = null;
  };

  const saveDocNow = () => {
    cancelDocSave();
    persistedDoc = history.present;
    void deps.session?.saveDoc(persistedDoc);
  };

  /** Stores the doc 500 ms after the last change (but at most 2.5 s after the first unsaved one), while a document is open. */
  const scheduleDocSave = () => {
    if (!deps.session || state.sources.size === 0 || history.present === persistedDoc) return;
    const now = Date.now();
    const since = savePendingSince ?? now;
    cancelDocSave();
    savePendingSince = since;
    const delay = Math.max(0, Math.min(SAVE_DOC_DELAY_MS, since + SAVE_DOC_MAX_WAIT_MS - now));
    saveTimer = setTimeout(saveDocNow, delay);
  };

  /** Stores doc + sources at once (the source set changed). */
  const saveAll = () => {
    cancelDocSave();
    persistedDoc = history.present;
    void deps.session?.save({ doc: persistedDoc, sources: [...state.sources.values()] });
  };

  const clearStored = () => {
    cancelDocSave();
    stored = null;
    storedReplaced = true;
    persistedDoc = history.present;
    void deps.session?.clear();
  };

  /** Publishes a new snapshot; doc/canUndo/canRedo always come from the history. */
  const set = (patch: Partial<AppState>) => {
    const next = { ...state, ...patch };
    if (next.exportReady && history.present !== exportedDoc) next.exportReady = null; // doc changed since export
    state = {
      ...next,
      doc: history.present,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
    };
    scheduleDocSave();
    listeners.forEach((l) => l());
  };

  const getDetector = (): Promise<OrientationDetector> => {
    detector ??= deps.createDetector().catch((e) => {
      detector = null; // allow a retry on the next document
      throw e;
    });
    return detector;
  };

  const getSource = (fileId: string): SourceFile => {
    const s = state.sources.get(fileId);
    if (!s) throw new Error(`Missing source file ${fileId}`);
    return s;
  };

  const runAnalysis = async (pages: Page[]) => {
    const todo = pages.filter((p) => !p.analyzed);
    if (todo.length === 0) return;
    const own = session;
    const { signal } = own.controller;
    const current = () => own === session && !signal.aborted;
    own.runs++;
    set({
      phase: 'analyzing',
      progress: { done: state.progress.done, total: state.progress.total + todo.length },
    });
    try {
      const det = await getDetector();
      if (!current()) return;
      await deps.analyzePages(
        todo,
        {
          render: renderPage,
          release: releaseCanvas,
          detector: det,
          thresholds: DEFAULT_THRESHOLDS,
          getSource,
          toGrayImage: canvasToGrayImage,
        },
        (a) => {
          if (!current()) return;
          metrics.record(a);
          history.mapAll((d) => mergeAnalysis(d, a));
          set({ progress: { ...state.progress, done: state.progress.done + 1 } });
        },
        { ...ANALYZE, deskew: state.deskew, signal },
      );
    } catch {
      if (current()) set({ error: strings.analysisError });
    } finally {
      own.runs--;
      if (own === session && own.runs === 0 && state.phase === 'analyzing') set({ phase: 'review' });
    }
  };

  const closeSession = () => {
    disposeOcr();
    session.controller.abort();
    session = { controller: new AbortController(), runs: 0 };
    for (const id of state.sources.keys()) void deps.forgetPdf(id).catch(() => {});
  };

  /** Pushes a user action onto the undo history (no-op when nothing changed). */
  const commit = (next: Doc, patch: Partial<AppState> = {}) => {
    if (next.pages === history.present.pages) return;
    history.push(next);
    set(patch);
  };

  const existing = (ids: Iterable<string>) => {
    const present = new Set(history.present.pages.map((p) => p.id));
    return [...ids].filter((id) => present.has(id));
  };

  const actions = {
    /** Shows a document right away and analyzes its unanalyzed pages in the background. */
    load(doc: Doc, sources: SourceFile[]) {
      closeSession();
      history = createHistory(doc);
      persistedDoc = doc;
      metrics = createMetrics();
      set({
        phase: 'review',
        sources: new Map(sources.map((s) => [s.id, s])),
        progress: { done: 0, total: 0 },
        selection: new Set(),
        selecting: false,
        filterFlagged: false,
        previewId: null,
        busy: null,
        exportProgress: null,
        restorable: false,
      });
      void runAnalysis(doc.pages);
    },

    async open(files: File[]) {
      if (files.length === 0 || state.busy) return;
      // The stored document is only replaced once the import succeeded (saveAll overwrites it).
      set({ busy: 'opening', error: null, restorable: false });
      try {
        const { sources, pages } = await deps.importFiles(files);
        stored = null;
        storedReplaced = true;
        actions.load({ pages }, sources);
        saveAll();
      } catch (e) {
        set({ busy: null, error: errorMessage(e), restorable: stored !== null });
        if (stored === null && !storedReplaced) loadStored(); // startup load was ignored while busy
      }
    },

    goHome() {
      closeSession();
      history = createHistory<Doc>({ pages: [] });
      clearStored();
      set({
        phase: 'home',
        sources: new Map(),
        progress: { done: 0, total: 0 },
        selection: new Set(),
        selecting: false,
        filterFlagged: false,
        previewId: null,
        busy: null,
        exportProgress: null,
      });
    },

    rotate(ids: Iterable<string>, delta: 90 | -90 | 180) {
      const valid = existing(ids);
      if (valid.length) commit(rotatePages(history.present, valid, delta));
    },

    move(from: number, to: number) {
      const n = history.present.pages.length;
      const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
      if (!ok(from) || !ok(to) || from === to) return;
      commit(movePage(history.present, from, to));
    },

    /** Moves page `activeId` to the position of page `overId` (drag & drop). */
    moveById(activeId: string, overId: string) {
      const pages = history.present.pages;
      const from = pages.findIndex((p) => p.id === activeId);
      const to = pages.findIndex((p) => p.id === overId);
      if (from >= 0 && to >= 0) actions.move(from, to);
    },

    remove(ids: Iterable<string>) {
      const valid = existing(ids);
      if (!valid.length) return;
      // removing ends the selection mode (nothing selected is left)
      commit(deletePages(history.present, valid), {
        selection: new Set(),
        selecting: false,
        previewId: state.previewId !== null && valid.includes(state.previewId) ? null : state.previewId,
      });
    },

    /** "Usuń puste strony": removes every page flagged blank (undoable like any removal). */
    removeBlankPages() {
      actions.remove(history.present.pages.filter((p) => p.flags.includes('blank')).map((p) => p.id));
    },

    async insertAt(index: number, files: File[]) {
      if (files.length === 0 || state.busy) return;
      const own = session;
      set({ busy: 'opening', error: null });
      try {
        const { sources, pages } = await deps.importFiles(files);
        if (own !== session) {
          sources.forEach((s) => void deps.forgetPdf(s.id).catch(() => {}));
          return;
        }
        const at = Math.max(0, Math.min(Math.trunc(index) || 0, history.present.pages.length));
        const all = new Map(state.sources);
        sources.forEach((s) => all.set(s.id, s));
        history.push(insertPages(history.present, at, pages));
        set({ sources: all, busy: null });
        saveAll();
        void runAnalysis(pages);
      } catch (e) {
        if (own === session) set({ busy: null, error: errorMessage(e) });
      }
    },

    undo() {
      history.undo();
      set({});
    },

    redo() {
      history.redo();
      set({});
    },

    openSaveSheet() {
      if (state.busy || history.present.pages.length === 0) return;
      set({ saveSheetOpen: true });
    },

    closeSaveSheet() {
      set({ saveSheetOpen: false });
    },

    /** Stops a running export; nothing is saved and no error is shown. */
    cancelExport() {
      exportCtrl?.abort();
    },

    /** Builds the PDF; sharing is a separate tap (shareExport) with a fresh user activation. */
    async export(opts: ExportOptions = state.exportOptions) {
      if (state.busy || history.present.pages.length === 0) return;
      saveExportOptions(deps.storage, opts);
      const own = session;
      const doc = history.present;
      const ctrl = new AbortController();
      exportCtrl = ctrl;
      set({
        busy: 'exporting',
        exportProgress: null,
        exportReady: null,
        error: null,
        notice: null,
        saveSheetOpen: false,
        exportOptions: opts,
      });
      try {
        let engine: OcrEngine | null = null;
        let ocrFailed = false;
        if (opts.ocr) {
          try {
            engine = await getOcr();
          } catch {
            ocrFailed = true; // save without the text layer and say so
          }
        }
        const bytes = await deps.exportPdf(
          doc,
          state.sources,
          (done, total) => {
            if (own === session) set({ exportProgress: { done, total, ocr: engine !== null } });
          },
          { compress: opts.compress, ocr: engine, signal: ctrl.signal },
        );
        if (own !== session) return;
        const first = state.sources.values().next().value as SourceFile | undefined;
        const file = pdfFile(bytes, exportFileName(first?.name ?? strings.defaultDocName));
        if (deps.shareFirst) {
          exportedDoc = doc;
          set({ busy: null, exportProgress: null, exportReady: file, notice: ocrFailed ? strings.ocrUnavailable : null });
        } else {
          deps.download(file);
          const saved = strings.savedNotice(file.name, formatSize(file.size));
          set({ busy: null, exportProgress: null, notice: ocrFailed ? `${saved} ${strings.ocrUnavailable}` : saved });
        }
      } catch (e) {
        if (own !== session) return;
        const cancelled = ctrl.signal.aborted && (e as { name?: string })?.name === 'AbortError';
        set({ busy: null, exportProgress: null, error: cancelled ? null : strings.exportError });
      } finally {
        if (exportCtrl === ctrl) exportCtrl = null;
      }
    },

    /** Opens the share sheet (or downloads) for the exported PDF; call it from the user's tap. */
    async shareExport() {
      const file = state.exportReady;
      if (!file) return;
      try {
        const result = await deps.share(file);
        if (result !== 'cancelled' && state.exportReady === file) {
          exportedDoc = null;
          set({ exportReady: null });
        }
      } catch {
        set({ error: strings.exportError });
      }
    },

    dismissNotice() {
      set({ notice: null });
    },

    openPreview(id: string) {
      set({ previewId: id });
    },

    closePreview() {
      if (state.previewId !== null) set({ previewId: null });
    },

    toggleSelecting() {
      set({ selecting: !state.selecting, selection: new Set() });
    },

    toggleSelected(id: string) {
      const selection = new Set(state.selection);
      if (!selection.delete(id)) selection.add(id);
      set({ selection });
    },

    /** Clears the selection too, so actions never touch pages hidden by the filter. */
    setFilterFlagged(filterFlagged: boolean) {
      set({ filterFlagged, selection: new Set() });
    },

    /** Applies to the next analysis run. */
    setDeskew(deskew: boolean) {
      try {
        deps.storage?.setItem(DESKEW_KEY, deskew ? '1' : '0');
      } catch {
        // private mode / blocked storage: keep the in-memory value only
      }
      set({ deskew });
    },

    dismissError() {
      set({ error: null });
    },

    /** Reopens the document stored by an earlier visit and finishes analyzing its pages. */
    restore() {
      const s = stored;
      stored = null;
      if (s) actions.load(s.doc, s.sources);
    },

    /** "Zacznij od nowa": forgets the stored document. */
    discardStored() {
      clearStored();
      set({ restorable: false });
    },

    /** Writes a pending debounced doc save now (the page is being hidden / may be killed). */
    flushSession() {
      if (saveTimer !== null) saveDocNow();
    },

    openDiagnostics() {
      set({ diagnostics: true });
    },

    closeDiagnostics() {
      set({ diagnostics: false });
    },

    /** Metrics report for the open document (analysis results since it was opened or restored). */
    metricsReport(device: string): string {
      return metrics.report(history.present, device);
    },
  };

  function loadStored() {
    void deps.session?.load().then((s) => {
      // ignore when the user already opened (or closed) something while it loaded
      if (!s || storedReplaced || state.phase !== 'home' || state.busy) return;
      stored = s;
      set({ restorable: true });
    }, () => {});
  }
  loadStored();

  return {
    ...actions,
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export type AppStore = ReturnType<typeof createAppStore>;
export type AppActions = Omit<AppStore, 'getState' | 'subscribe'>;

const StoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ store, children }: { store: AppStore; children: ReactNode }) {
  return createElement(StoreContext.Provider, { value: store }, children);
}

export function useAppStore(): AppState & AppActions & { getSource(fileId: string): SourceFile | undefined } {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useAppStore outside AppStoreProvider');
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return useMemo(
    () => ({ ...store, ...state, getSource: (id: string) => state.sources.get(id) }),
    [store, state],
  );
}

export const isFlagged = (p: Page): boolean => p.flags.length > 0;
