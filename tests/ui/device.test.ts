import { isWeakDevice, nextLookDelay, rafThrottle } from '../../src/ui/device';

describe('weak phone', () => {
  it('few cores or little memory make a weak phone; a new one is not', () => {
    expect(isWeakDevice({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe(true);
    expect(isWeakDevice({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe(true); // e.g. Redmi 7 (3 GB)
    expect(isWeakDevice({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false); // e.g. Galaxy S24
    expect(isWeakDevice({ hardwareConcurrency: 8 })).toBe(false); // iPhone: no memory figure, judged by cores
  });
});

describe('camera: time between looks for the sheet', () => {
  it('never less than 200 ms; a slow look waits longer, so the picture keeps three quarters of the time', () => {
    expect(nextLookDelay(10)).toBe(200);
    expect(nextLookDelay(150)).toBe(450);
    expect(nextLookDelay(400)).toBe(1000); // at most a second
  });
});

describe('one update per screen frame', () => {
  it('many finger moves in one frame run once, with the last position; flush runs a pending one at once', () => {
    const frames: Array<() => void> = [];
    const raf = (cb: () => void) => (frames.push(cb), frames.length);
    const seen: number[] = [];
    const t = rafThrottle((v: number) => seen.push(v), raf);
    t(1);
    t(2);
    t(3);
    expect(seen).toEqual([]);
    frames.shift()!();
    expect(seen).toEqual([3]);
    t(4);
    t.flush();
    expect(seen).toEqual([3, 4]);
    frames.shift()!(); // the frame that was asked for has nothing left to do
    expect(seen).toEqual([3, 4]);
  });
});
