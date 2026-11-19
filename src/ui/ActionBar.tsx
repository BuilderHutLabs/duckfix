import { useAppStore } from './store';
import { strings } from './strings';

/** Bottom bar of the review screen: save (or share) normally, rotate / remove while selecting. */
export function ActionBar() {
  const s = useAppStore();

  if (s.selecting) {
    const n = s.selection.size;
    return (
      <footer className="action-bar">
        <button type="button" className="btn" disabled={n === 0} onClick={() => s.rotate(s.selection, 90)}>
          {strings.rotate}
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
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={s.busy !== null || s.phase === 'analyzing' || s.doc.pages.length === 0}
          onClick={() => void s.export()}
        >
          {s.busy !== 'exporting'
            ? strings.save
            : s.exportProgress
              ? strings.savingProgress(s.exportProgress.done, s.exportProgress.total)
              : strings.saving}
        </button>
      )}
    </footer>
  );
}
