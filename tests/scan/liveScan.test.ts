import { createOutline, createSteady, quadToView, type LiveState } from '../../src/scan/liveScan';
import type { Quad } from '../../src/scan/quad';

const W = 400;
const H = 300;
/** A sheet filling most of a 400×300 frame, nudged by d pixels. */
const sheet = (d = 0): Quad => [
  { x: 60 + d, y: 30 },
  { x: 340 + d, y: 30 },
  { x: 340 + d, y: 270 },
  { x: 60 + d, y: 270 },
];
const small: Quad = [
  { x: 180, y: 130 },
  { x: 260, y: 130 },
  { x: 260, y: 200 },
  { x: 180, y: 200 },
];

function run(steady: ReturnType<typeof createSteady>, frames: Array<[Quad | null, number]>): LiveState[] {
  return frames.map(([q, t]) => steady.push(q, W, H, t).state);
}

describe('live sheet tracking (auto-shot)', () => {
  it('a sheet held still for the hold time becomes ready; progress grows meanwhile', () => {
    const s = createSteady({ holdMs: 900 });
    expect(s.push(sheet(), W, H, 0)).toMatchObject({ state: 'hold', progress: 0 });
    expect(s.push(sheet(1), W, H, 450).progress).toBeCloseTo(0.5, 1);
    expect(s.push(sheet(), W, H, 950).state).toBe('ready');
  });

  it('moving the phone starts the wait again', () => {
    const s = createSteady({ holdMs: 900 });
    expect(
      run(s, [
        [sheet(), 0],
        [sheet(40), 600],
        [sheet(40), 1200],
        [sheet(40), 1600],
      ]),
    ).toEqual(['hold', 'hold', 'hold', 'ready']);
  });

  it('no sheet: none; a small sheet far away: far (never ready)', () => {
    const s = createSteady({ holdMs: 900 });
    expect(
      run(s, [
        [null, 0],
        [small, 100],
        [small, 2000],
      ]),
    ).toEqual(['none', 'far', 'far']);
  });

  it('after a shot the same sheet is not taken again until it goes away or changes a lot', () => {
    const s = createSteady({ holdMs: 900 });
    run(s, [
      [sheet(), 0],
      [sheet(), 1000],
    ]);
    s.fired();
    expect(
      run(s, [
        [sheet(), 1100],
        [sheet(), 3000],
      ]),
    ).toEqual(['done', 'done']);
    // the next sheet is laid down: the old one disappears for a moment
    expect(
      run(s, [
        [null, 3100],
        [sheet(), 3200],
        [sheet(), 4200],
      ]),
    ).toEqual(['none', 'hold', 'ready']);
  });

  it('a sheet swapped without leaving the frame (big change) arms again', () => {
    const s = createSteady({ holdMs: 900 });
    run(s, [
      [sheet(), 0],
      [sheet(), 1000],
    ]);
    s.fired();
    expect(
      run(s, [
        [small, 1100],
        [sheet(), 1200],
        [sheet(), 2200],
      ]),
    ).toEqual(['far', 'hold', 'ready']);
  });
});

describe('outline on the screen', () => {
  it('maps frame pixels into a contained video (letterbox on top and bottom)', () => {
    // 400×300 frame shown in a 200×400 box: scale 0.5, 125 px bars above and below
    const v = quadToView(sheet(), W, H, 200, 400);
    expect(v[0]).toEqual({ x: 30, y: 140 });
    expect(v[2]).toEqual({ x: 170, y: 260 });
  });
});

describe('steady outline on the screen', () => {
  it('small jitter is smoothed, a real move is followed at once', () => {
    const o = createOutline();
    o.push(sheet(0), W, H);
    const jitter = o.push(sheet(6), W, H)!;
    expect(jitter[0].x).toBeGreaterThan(60);
    expect(jitter[0].x).toBeLessThan(66);
    const jump = o.push(sheet(80), W, H)!;
    expect(jump[0].x).toBe(140);
  });

  it('one frame without the sheet keeps the outline; more frames drop it', () => {
    const o = createOutline();
    o.push(sheet(0), W, H);
    expect(o.push(null, W, H)).not.toBeNull();
    expect(o.push(null, W, H)).not.toBeNull();
    expect(o.push(null, W, H)).toBeNull();
  });
});
