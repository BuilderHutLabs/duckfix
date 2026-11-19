import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from './store';
import { strings } from './strings';
import { ANALYSIS_MAX_SIDE } from '../pipeline/analyze';
import { DEFAULT_THRESHOLDS } from '../orientation/policy';

const TAPS = 5;
const TAPS_WINDOW_MS = 3000;
export const DIAG_HASH = '#diag';

/** Click handler that calls `onUnlock` after 5 taps within 3 s (hidden entry to diagnostics). */
export function useSecretTaps(onUnlock: () => void): () => void {
  const taps = useRef<number[]>([]);
  return useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < TAPS_WINDOW_MS), now];
    if (taps.current.length >= TAPS) {
      taps.current = [];
      onUnlock();
    }
  }, [onUnlock]);
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Text report for the developer: build constants, analysis metrics and memory/storage use. */
async function buildReport(metricsReport: string): Promise<string> {
  const lines = [
    `${strings.appName} — ${strings.diagTitle}`,
    `Data: ${new Date().toISOString()}`,
    `ANALYSIS_MAX_SIDE: ${ANALYSIS_MAX_SIDE}`,
    `DEFAULT_THRESHOLDS: minConfidence=${DEFAULT_THRESHOLDS.minConfidence}, minInk=${DEFAULT_THRESHOLDS.minInk}`,
    metricsReport,
  ];
  const memory = (performance as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } })
    .memory;
  if (memory) {
    lines.push(
      `Pamięć JS: użyte ${mb(memory.usedJSHeapSize)}, przydzielone ${mb(memory.totalJSHeapSize)}, limit ${mb(memory.jsHeapSizeLimit)}`,
    );
  }
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) lines.push(`Magazyn: użyte ${mb(est.usage ?? 0)} z ${mb(est.quota ?? 0)}`);
  } catch {
    // not available (private mode / old Safari)
  }
  return lines.join('\n');
}

export function Diagnostics({ onClose }: { onClose(): void }) {
  const { metricsReport } = useAppStore();
  const [report, setReport] = useState('');
  const [copied, setCopied] = useState(false);
  const pre = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let live = true;
    void buildReport(metricsReport(navigator.userAgent)).then((r) => {
      if (live) setReport(r);
    });
    return () => {
      live = false;
    };
  }, [metricsReport]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      // no clipboard API (or denied): select the text so the user can copy it by hand
      const el = pre.current;
      const sel = window.getSelection();
      if (!el || !sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  };

  const canShare = typeof navigator.share === 'function';

  return (
    <main className="diag">
      <header className="toolbar diag-bar">
        <h1 className="diag-title">{strings.diagTitle}</h1>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {strings.close}
        </button>
        <div className="diag-actions">
          <button type="button" className="btn btn-plain" disabled={!report} onClick={() => void copy()}>
            {copied ? strings.copied : strings.copy}
          </button>
          {canShare && (
            <button
              type="button"
              className="btn btn-plain"
              disabled={!report}
              onClick={() => void navigator.share({ text: report }).catch(() => {})}
            >
              {strings.share}
            </button>
          )}
        </div>
      </header>
      <pre ref={pre} className="diag-report" data-testid="diag-report">
        {report}
      </pre>
    </main>
  );
}
