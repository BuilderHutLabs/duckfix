import { untouchedRate, type Doc } from '../model/document';
import type { PageAnalysis } from '../pipeline/analyze';

export function createMetrics(): { record(a: PageAnalysis): void; report(doc: Doc, device: string): string } {
  const records: PageAnalysis[] = [];
  return {
    record(a) {
      records.push(a);
    },
    report(doc, device) {
      const n = records.length;
      const total = records.reduce((s, r) => s + r.ms, 0);
      const rot: Record<number, number> = { 0: 0, 90: 0, 180: 0, 270: 0 };
      for (const r of records) rot[r.rotation]++;
      const meanConf = n ? records.reduce((s, r) => s + r.confidence, 0) / n : 0;
      const flagged = (f: string) => records.filter((r) => (r.flags as string[]).includes(f)).length;
      const failed = records.filter((r) => r.error !== undefined);
      return [
        `Urządzenie: ${device}`,
        `Liczba stron: ${n}`,
        `Średni czas na stronę: ${(n ? total / n : 0).toFixed(0)} ms`,
        `Całkowity czas: ${total.toFixed(0)} ms`,
        `Rozkład obrotów: 0°=${rot[0]}, 90°=${rot[90]}, 180°=${rot[180]}, 270°=${rot[270]}`,
        `Średnia pewność: ${meanConf.toFixed(2)}`,
        `Odsetek stron bez poprawek (untouchedRate): ${(untouchedRate(doc) * 100).toFixed(0)}%`,
        `Flagi: check-orientation=${flagged('check-orientation')}, low-text=${flagged('low-text')}`,
        `Błędy analizy: ${failed.length}`,
        ...(failed.length ? [`Ostatni błąd: ${failed[failed.length - 1].error}`] : []),
      ].join('\n');
    },
  };
}
