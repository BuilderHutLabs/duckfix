import { useAppStore } from './store';
import { strings } from './strings';

export function Progress() {
  const { phase, progress } = useAppStore();
  if (phase !== 'analyzing') return null;
  const { done, total } = progress;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <span className="progress-text">{strings.analyzing(done, total)}</span>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${total ? (100 * done) / total : 0}%` }} />
      </div>
    </div>
  );
}
