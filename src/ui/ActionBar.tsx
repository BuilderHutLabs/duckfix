import { useAppStore } from './store';
import { strings } from './strings';

/** Bottom bar of the review screen: save (or share) normally, rotate / remove while selecting. */
export function ActionBar() {
  const s = useAppStore();

  if (s.selecting) {
    const n = s.selection.size;
    return (
      <footer className="action-bar action-bar-select">
        <button type="button" className="btn" disabled={n === 0} onClick={() => s.rotate(s.selection, 90)}>
          {strings.rotate}
        </button>
        <button type="button" className="btn" disabled={n === 0} onClick={() => s.openFilterSheet(s.selection)}>
          {strings.pageLook}
        </button>
        <button
          type="button"
          className="btn"
          aria-label={strings.saveSelected}
          disabled={n === 0}
          onClick={() => s.openSaveSheet(s.selection)}
        >
          {strings.saveShort}
        </button>
        <button type="button" className="btn btn-danger" disabled={n === 0} onClick={() => s.remove(s.selection)}>
          {strings.remove}
        </button>
      </footer>
    );
  }

  return (
    <footer className="action-bar">
      {s.exportReady ? (
        // separate tap: the share sheet needs a fresh user activation after a long export
        <button type="button" className="btn btn-primary" onClick={() => void s.shareExport()}>
          {strings.shareExport}
        </button>
      ) : s.busy === 'exporting' ? (
        <>
          <button type="button" className="btn btn-primary" disabled>
            {!s.exportProgress
              ? strings.saving
              : s.exportProgress.ocr
                ? strings.ocrProgress(s.exportProgress.done, s.exportProgress.total)
                : strings.savingProgress(s.exportProgress.done, s.exportProgress.total)}
          </button>
          <button type="button" className="btn" onClick={() => s.cancelExport()}>
            {strings.cancel}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={s.busy !== null || s.phase === 'analyzing' || s.doc.pages.length === 0}
          onClick={() => s.openSaveSheet()}
        >
          {strings.save}
        </button>
      )}
    </footer>
  );
}
